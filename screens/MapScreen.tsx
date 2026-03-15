import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { supabase } from '../services/supabase';
import { haversineDistance } from '../services/movement';
import { fetchMelbourneParkingBays } from '../services/melbourneSensors';
import { openGoogleMapsNavigation } from '../services/navigation';

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
  const [selectedSensor, setSelectedSensor] = useState<ParkingBay | null>(null);
  const [sensorSheetVisible, setSensorSheetVisible] = useState(false);

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
    if (__DEV__) {
      supabase
        .from('spots')
        .delete()
        .neq('id', 'none')
        .then(({ error }) => {
          if (!error) console.log('DEV: Cleared all spots');
        });
    }

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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      pendingLocRef.current = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };

      setCurrentLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });

      setRegion((prev) => ({
        ...prev,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      }));

      const [carPark, currentPressure] = await Promise.all([
        isInsideCarPark(loc.coords.latitude, loc.coords.longitude),
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
    if (!currentLocation) {
      Alert.alert(
        'Location required',
        'Please enable location services to claim spots.',
      );
      return;
    }

    const distance = haversineDistance(
      currentLocation.lat,
      currentLocation.lng,
      spot.location.lat,
      spot.location.lng,
    );

    if (distance > 1000) {
      Alert.alert('Too far', 'This spot is too far away to claim.');
      return;
    }

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

  const handleNavigateToSensor = async (lat: number, lng: number) => {
    await openGoogleMapsNavigation(lat, lng, 'Parking Bay');
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
        showsUserLocation
        showsMyLocationButton
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            title="Your Spot"
            description="Shared by you"
            pinColor="#FF6B35"
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
            description="Tap to claim • Hold to navigate"
            pinColor="#34C759"
            onPress={() => handleSpotPress(spot)}
            onLongPress={() => openGoogleMapsNavigation(
              spot.location.lat,
              spot.location.lng,
              'Parking Karma Spot'
            )}
          />
        ))}

        {sensorBays.map((bay) => {
          const stale = (Date.now() - bay.lastUpdated.getTime()) > 5 * 60 * 1000;
          return (
            <Marker
              key={`sensor-${bay.bayId}-${bay.lat}-${bay.lng}`}
              coordinate={{ latitude: bay.lat, longitude: bay.lng }}
              pinColor={stale ? '#8E8E93' : '#4285F4'}
              title={`Bay ${bay.markerId}`}
              description="Tap for details • Hold to navigate"
              onPress={() => {
                setSelectedSensor(bay);
                setSensorSheetVisible(true);
              }}
              onLongPress={() => openGoogleMapsNavigation(
                bay.lat,
                bay.lng,
                'Parking Bay'
              )}
            />
          );
        })}
      </MapView>

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

      {/* Sensor bay detail sheet */}
      <Modal
        visible={sensorSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSensorSheetVisible(false)}
      >
        <View style={styles.sensorOverlay}>
          <View style={styles.sensorSheet}>
            <View style={styles.sensorHandle} />
            {selectedSensor && (
              <>
                <Text style={styles.sensorTitle}>Bay {selectedSensor.markerId}</Text>
                <Text style={styles.sensorStatus}>
                  Status: {selectedSensor.status}
                </Text>
                <Text style={styles.sensorMeta}>
                  Last updated:{' '}
                  {selectedSensor.lastUpdated.toLocaleTimeString()}
                </Text>
                <TouchableOpacity
                  style={styles.sensorNavigateBtn}
                  onPress={() => {
                    handleNavigateToSensor(selectedSensor.lat, selectedSensor.lng);
                    setSensorSheetVisible(false);
                  }}
                >
                  <Text style={styles.sensorNavigateBtnText}>
                    🗺️ Navigate Here
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.sensorDismissBtn}
              onPress={() => setSensorSheetVisible(false)}
            >
              <Text style={styles.sensorDismissBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  sensorOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sensorSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 12,
  },
  sensorHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sensorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  sensorStatus: {
    color: '#CCCCCC',
    fontSize: 15,
  },
  sensorMeta: {
    color: '#888',
    fontSize: 13,
  },
  sensorNavigateBtn: {
    backgroundColor: '#4285F4',
    padding: 14,
    alignItems: 'center',
    borderRadius: 4,
    marginTop: 4,
  },
  sensorNavigateBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Courier New',
  },
  sensorDismissBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sensorDismissBtnText: {
    color: '#888',
    fontSize: 14,
  },
});
