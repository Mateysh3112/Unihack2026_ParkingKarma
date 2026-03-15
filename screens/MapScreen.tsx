import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { FABButton } from '../components/FABButton';
import { FloorSelectionSheet } from './FloorSelectionSheet';
import { LeavingVerificationScreen } from './LeavingVerificationScreen';
import { SpotClaimScreen } from './SpotClaimScreen';
import { useAppStore } from '../store/useAppStore';
import { useVerificationStore } from '../store/useVerificationStore';
import {
  CarPark,
  FloorSelectionResult,
  FirestoreSpot,
  ParkingBay,
} from '../types';
import {
  sampleBarometer,
  computeAltitude,
  computeFloor,
  ELEVATED_THRESHOLD_METRES,
} from '../services/barometer';
import { isInsideCarPark } from '../services/carParks';
import { subscribeToBroadcastingSpots, expireOldSpots } from '../services/spots';
import { haversineDistance } from '../services/movement';
import { fetchMelbourneParkingBays } from '../services/melbourneSensors';

const INITIAL_REGION = {
  latitude: -37.81263375505453,
  longitude: 144.9626319477889,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export function MapScreen() {
  const [region, setRegion] = useState(INITIAL_REGION);
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [floorSheetVisible, setFloorSheetVisible] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedCarPark, setDetectedCarPark] = useState<CarPark | null>(null);
  const [detectedAltitude, setDetectedAltitude] = useState<number | null>(null);
  const [detectedFloor, setDetectedFloor] = useState<number | null>(null);
  const [broadcastingSpots, setBroadcastingSpots] = useState<
    (FirestoreSpot & { id: string })[]
  >([]);
  const [claimScreenVisible, setClaimScreenVisible] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<
    (FirestoreSpot & { id: string }) | null
  >(null);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [sensorBays, setSensorBays] = useState<ParkingBay[]>([]);

  const pendingLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<MapView>(null);

  const { spots, user } = useAppStore();
  const {
    baselinePressure,
    resetVerification,
    setCurrentAltitude,
    startVerification,
  } = useVerificationStore();

  useEffect(() => {
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const nextLocation = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };
        setCurrentLocation(nextLocation);
        setRegion((prev) => ({
          ...prev,
          latitude: nextLocation.lat,
          longitude: nextLocation.lng,
        }));
      } catch {
        // Keep the Melbourne CBD default region.
      }
    })();

    const unsubscribe = subscribeToBroadcastingSpots((nextSpots) => {
      setBroadcastingSpots(nextSpots);
    });

    const expiryInterval = setInterval(expireOldSpots, 60_000);

    return () => {
      unsubscribe();
      clearInterval(expiryInterval);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSensorBays = () => {
      fetchMelbourneParkingBays().then((bays) => {
        if (!isMounted) return;
        console.log('Sensor bays loaded:', bays.length);
        setSensorBays(bays);
      });
    };

    loadSensorBays();
    const interval = setInterval(loadSensorBays, 30_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const launchVerification = async (floorData?: FloorSelectionResult) => {
    const pendingLoc = pendingLocRef.current;
    if (!pendingLoc || !user) return;

    await startVerification(user.id, pendingLoc.lat, pendingLoc.lng, floorData);
    setVerificationVisible(true);
  };

  const handleLeaving = async () => {
    if (detecting) return;

    setDetecting(true);
    try {
      // TESTING MODE: use map center instead of GPS so pin can be placed anywhere
      const lat = region.latitude;
      const lng = region.longitude;

      pendingLocRef.current = { lat, lng };
      setCurrentLocation({ lat, lng });

      const [carPark, currentPressure] = await Promise.all([
        isInsideCarPark(lat, lng),
        sampleBarometer(),
      ]);

      let altitude: number | null = null;
      let floor: number | null = null;

      if (baselinePressure !== null && currentPressure !== null) {
        altitude = computeAltitude(currentPressure, baselinePressure);
        floor = computeFloor(altitude);
      }

      setCurrentAltitude(altitude);
      setDetectedCarPark(carPark);
      setDetectedAltitude(altitude);
      setDetectedFloor(floor);

      const shouldAskForFloor =
        carPark !== null ||
        (altitude !== null && altitude > ELEVATED_THRESHOLD_METRES);

      if (shouldAskForFloor) {
        setFloorSheetVisible(true);
        return;
      }

      await launchVerification({
        floor: 0,
        isMultiStorey: false,
        carParkId: null,
        carParkName: null,
        isNewCarPark: false,
      });
    } catch {
      Alert.alert(
        'Location unavailable',
        'Could not start departure verification.',
      );
    } finally {
      setDetecting(false);
    }
  };

  const handleFloorConfirmed = async (result: FloorSelectionResult) => {
    setFloorSheetVisible(false);
    await launchVerification(result);
  };

  const handleSpotPress = (spot: FirestoreSpot & { id: string }) => {
    // TESTING MODE: distance restriction and location requirement removed
    setSelectedSpot(spot);
    setClaimScreenVisible(true);
  };

  const handleClaimSuccess = () => {
    setClaimScreenVisible(false);
    setSelectedSpot(null);
  };

  const handleClaimDismiss = () => {
    setClaimScreenVisible(false);
    setSelectedSpot(null);
  };

  const handleVerificationClose = () => {
    setVerificationVisible(false);
    pendingLocRef.current = null;
    resetVerification();
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            title="Your Spot"
            description="Tap to view details"
            pinColor="#FF6B35"
            onPress={() => handleSpotPress({
              id: spot.id,
              sharerId: spot.reportedBy,
              location: { lat: spot.latitude, lng: spot.longitude },
              status: 'broadcasting',
              createdAt: spot.reportedAt.getTime(),
              broadcastAt: spot.reportedAt.getTime(),
              claimedBy: null,
              claimedAt: null,
              karmaAwarded: false,
              floor: spot.floor,
              isMultiStorey: spot.isMultiStorey,
              carParkName: spot.carParkName,
            })}
          />
        ))}

        {broadcastingSpots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{
              latitude: spot.location.lat,
              longitude: spot.location.lng,
            }}
            title="Free Spot"
            description="Tap to claim"
            pinColor="#34C759"
            onPress={() => handleSpotPress(spot)}
          />
        ))}

        {/* sensorBays disabled for now */}
      </MapView>

      {/* Crosshair — shows where the pin will drop */}
      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
        <View style={styles.crosshairDot} />
      </View>

      <FABButton onPress={handleLeaving} label={detecting ? 'CHECKING...' : "I'M LEAVING!"} />

      <FloorSelectionSheet
        visible={floorSheetVisible}
        carPark={detectedCarPark}
        altitude={detectedAltitude}
        estimatedFloor={detectedFloor}
        userId={user?.id ?? ""}
        userLat={pendingLocRef.current?.lat ?? 0}
        userLng={pendingLocRef.current?.lng ?? 0}
        onConfirm={handleFloorConfirmed}
        onDismiss={() => {
          setFloorSheetVisible(false);
          pendingLocRef.current = null;
        }}
      />

      <LeavingVerificationScreen
        visible={verificationVisible}
        onClose={handleVerificationClose}
      />

      <SpotClaimScreen
        visible={claimScreenVisible}
        spot={
          selectedSpot
            ? {
                id: selectedSpot.id,
                sharerId: selectedSpot.sharerId,
                lat: selectedSpot.location.lat,
                lng: selectedSpot.location.lng,
                distance: currentLocation
                  ? haversineDistance(
                      currentLocation.lat,
                      currentLocation.lng,
                      selectedSpot.location.lat,
                      selectedSpot.location.lng,
                    )
                  : 0,
                floor: selectedSpot.floor,
                isMultiStorey: selectedSpot.isMultiStorey,
                carParkName: selectedSpot.carParkName,
              }
            : null
        }
        onClaimed={handleClaimSuccess}
        onDismiss={handleClaimDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 24,
    height: 1.5,
    backgroundColor: '#FF6B35',
  },
  crosshairV: {
    position: 'absolute',
    width: 1.5,
    height: 24,
    backgroundColor: '#FF6B35',
  },
  crosshairDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF6B35',
  },
});
