import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { FABButton } from '../components/FABButton';
import { useAppStore } from '../store/useAppStore';
import { useVerificationStore } from '../store/useVerificationStore';
import { LeavingVerificationScreen } from './LeavingVerificationScreen';
import { SpotClaimScreen } from './SpotClaimScreen';
import { FloorSelectionSheet } from './FloorSelectionSheet';
import { CarPark, FloorSelectionResult, ParkingSpot } from '../types';
import { haversineDistance } from '../services/movement';
import { isInsideCarPark } from '../services/carParks';
import {
  sampleBarometer,
  computeAltitude,
  computeFloor,
  floorLabel,
  ELEVATED_THRESHOLD_METRES,
} from '../services/barometer';

const MELBOURNE = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

// Simulated nearby spot for demo — in production this comes from push notifications
// and Firestore real-time listeners for spots with status='broadcasting'.
const DEMO_NEARBY_SPOT = {
  id: 'demo_spot_001',
  sharerId: 'user_nearby',
  lat: -37.8142,
  lng: 144.9638,
  distance: 85,     // metres
  floor: 2,
  isMultiStorey: true,
  carParkName: 'Wilson Parking Melbourne Central',
};

export function MapScreen() {
  const [region, setRegion] = useState(MELBOURNE);
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [claimVisible, setClaimVisible] = useState(false);
  const [showDemoSpotBanner, setShowDemoSpotBanner] = useState(false);

  // Floor detection state
  const [detecting, setDetecting] = useState(false);
  const [floorSheetVisible, setFloorSheetVisible] = useState(false);
  const [detectedCarPark, setDetectedCarPark] = useState<CarPark | null>(null);
  const [detectedAltitude, setDetectedAltitude] = useState<number | null>(null);
  const [detectedFloor, setDetectedFloor] = useState<number | null>(null);

  // Holds the GPS position captured during detection, consumed on floor confirm
  const pendingLocRef = useRef<{ lat: number; lng: number } | null>(null);

  const { spots, addSpot, user } = useAppStore();
  const { startVerification, verificationStatus, baselinePressure } = useVerificationStore();

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setRegion((r) => ({
          ...r,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }));
      } catch {
        // fall back to Melbourne default
      }
    })();
  }, []);

  // Show demo nearby spot banner after 5 seconds (simulates push notification)
  useEffect(() => {
    const timer = setTimeout(() => setShowDemoSpotBanner(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // "I'm Leaving" — run floor detection then show sheet or go straight through
  // ---------------------------------------------------------------------------
  const handleLeaving = async () => {
    if (user.isFrozen) {
      Alert.alert(
        "Karma Frozen ❄️",
        "Your karma has been frozen for 48 hours. Reflect on your choices.",
      );
      return;
    }

    setDetecting(true);
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      pendingLocRef.current = { lat, lng };

      // Run car park lookup + barometer sampling in parallel
      const [carPark, currentPressure] = await Promise.all([
        isInsideCarPark(lat, lng),
        sampleBarometer(),
      ]);

      // Compute altitude relative to the baseline captured at app launch
      let altitude: number | null = null;
      let estFloor: number | null = null;
      if (currentPressure !== null && baselinePressure !== null) {
        altitude = computeAltitude(currentPressure, baselinePressure);
        estFloor = computeFloor(altitude);
      }

      // STATE C — ground level at an unknown location: skip the floor sheet
      const needsFloorSheet =
        carPark !== null ||
        (altitude !== null && altitude > ELEVATED_THRESHOLD_METRES);

      if (!needsFloorSheet) {
        // Go straight to verification at ground level
        const groundResult: FloorSelectionResult = {
          floor: 0,
          isMultiStorey: false,
          carParkId: null,
          carParkName: null,
          isNewCarPark: false,
        };
        await launchVerification(lat, lng, groundResult);
      } else {
        // Show the floor selection sheet
        setDetectedCarPark(carPark);
        setDetectedAltitude(altitude);
        setDetectedFloor(estFloor);
        setFloorSheetVisible(true);
      }
    } catch {
      Alert.alert('Error', 'Could not get your location. Please try again.');
    } finally {
      setDetecting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Called after floor is confirmed (either from sheet or STATE C shortcut)
  // ---------------------------------------------------------------------------
  const launchVerification = async (
    lat: number,
    lng: number,
    floorData: FloorSelectionResult,
  ) => {
    // Add spot marker to map immediately (optimistic)
    const spot: ParkingSpot = {
      id: `spot_${Date.now()}`,
      latitude: lat,
      longitude: lng,
      reportedBy: user.id,
      reportedAt: new Date(),
      active: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: 'pending_movement',
      floor: floorData.floor,
      isMultiStorey: floorData.isMultiStorey,
      carParkName: floorData.carParkName,
    };
    addSpot(spot);

    await startVerification(user.id, lat, lng, floorData);
    setVerificationVisible(true);
  };

  const handleFloorConfirmed = async (result: FloorSelectionResult) => {
    setFloorSheetVisible(false);
    const loc = pendingLocRef.current;
    if (!loc) return;
    await launchVerification(loc.lat, loc.lng, result);
  };

  const handleVerificationClose = () => {
    setVerificationVisible(false);
  };

  const handleSpotClaimed = () => {
    useVerificationStore.getState().onSpotClaimed(user.id);
    setClaimVisible(false);
    setShowDemoSpotBanner(false);
  };

  const handleClaimDismiss = () => {
    setClaimVisible(false);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={region}
        showsUserLocation
        showsMyLocationButton
      >
        {spots.map((spot) => {
          const hasFloor = spot.isMultiStorey && spot.floor !== undefined;
          const floorLine = hasFloor
            ? `Floor ${floorLabel(spot.floor!)}${spot.carParkName ? ` · ${spot.carParkName}` : ''}`
            : null;

          return (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              title={
                spot.status === 'broadcasting'
                  ? '🚗 Spot Becoming Available!'
                  : '🅿️ Free Spot!'
              }
              description={
                spot.status === 'pending_movement'
                  ? 'Verifying departure...'
                  : floorLine ?? 'Shared by a Parking Karma user'
              }
              pinColor={spot.status === 'broadcasting' ? '#34C759' : '#FF6B35'}
            />
          );
        })}

        {/* Demo nearby spot marker */}
        {showDemoSpotBanner && (
          <Marker
            coordinate={{ latitude: DEMO_NEARBY_SPOT.lat, longitude: DEMO_NEARBY_SPOT.lng }}
            title="🅿️ Spot Available Nearby!"
            description={`Floor ${floorLabel(DEMO_NEARBY_SPOT.floor)} · ${DEMO_NEARBY_SPOT.carParkName}`}
            pinColor="#34C759"
            onPress={() => {
              setShowDemoSpotBanner(false);
              setClaimVisible(true);
            }}
          />
        )}
      </MapView>

      {/* Nearby spot notification banner */}
      {showDemoSpotBanner && (
        <TouchableOpacity
          style={styles.notificationBanner}
          onPress={() => {
            setShowDemoSpotBanner(false);
            setClaimVisible(true);
          }}
        >
          <Text style={styles.notificationEmoji}>🅿️</Text>
          <View style={styles.notificationText}>
            <Text style={styles.notificationTitle}>Spot Available Nearby!</Text>
            <Text style={styles.notificationSub}>
              {DEMO_NEARBY_SPOT.distance}m · Floor {floorLabel(DEMO_NEARBY_SPOT.floor)} · Tap to claim
            </Text>
          </View>
          <Text style={styles.notificationChevron}>›</Text>
        </TouchableOpacity>
      )}

      {/* Detecting overlay — shown while barometer + car park lookup run */}
      {detecting && (
        <View style={styles.detectingOverlay}>
          <ActivityIndicator color="#FF6B35" size="small" />
          <Text style={styles.detectingText}>Detecting location...</Text>
        </View>
      )}

      {/* Frozen account banner */}
      {user.isFrozen && (
        <View style={styles.frozenBanner}>
          <Text style={styles.frozenBannerText}>
            ❄️ Karma frozen — {user.freezeExpiresAt
              ? `${Math.ceil((user.freezeExpiresAt - Date.now()) / (1000 * 60 * 60))}h remaining`
              : '48h remaining'}
          </Text>
        </View>
      )}

      {/* Parking Sinner banner */}
      {useAppStore.getState().isParkingSinner() && (
        <View style={styles.sinnerBanner}>
          <Text style={styles.sinnerBannerText}>😈 Parking Sinner debuff active</Text>
        </View>
      )}

      <FABButton onPress={handleLeaving} />

      {/* Floor selection sheet — shown before verification when elevated */}
      <FloorSelectionSheet
        visible={floorSheetVisible}
        carPark={detectedCarPark}
        altitude={detectedAltitude}
        estimatedFloor={detectedFloor}
        userId={user.id}
        userLat={pendingLocRef.current?.lat ?? 0}
        userLng={pendingLocRef.current?.lng ?? 0}
        onConfirm={handleFloorConfirmed}
        onDismiss={() => setFloorSheetVisible(false)}
      />

      {/* Verification modal — shown to the sharer */}
      <LeavingVerificationScreen
        visible={verificationVisible}
        onClose={handleVerificationClose}
      />

      {/* Claim modal — shown to nearby receivers */}
      <SpotClaimScreen
        visible={claimVisible}
        spot={DEMO_NEARBY_SPOT}
        onClaimed={handleSpotClaimed}
        onDismiss={handleClaimDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  notificationBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  notificationEmoji: { fontSize: 28 },
  notificationText: { flex: 1 },
  notificationTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  notificationSub: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  notificationChevron: {
    color: '#34C759',
    fontSize: 24,
    fontWeight: '700',
  },

  detectingOverlay: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 6,
  },
  detectingText: {
    color: '#AAAAAA',
    fontSize: 14,
    fontWeight: '500',
  },

  frozenBanner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#0A1A2E',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#5AC8FA',
    alignItems: 'center',
  },
  frozenBannerText: {
    color: '#5AC8FA',
    fontWeight: '600',
    fontSize: 14,
  },

  sinnerBanner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#2A0A0A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
    alignItems: 'center',
  },
  sinnerBannerText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 14,
  },
});
