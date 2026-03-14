import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { FABButton } from '../components/FABButton';
import { FloorSelectionSheet } from './FloorSelectionSheet';
import { LeavingVerificationScreen } from './LeavingVerificationScreen';
import { useAppStore } from '../store/useAppStore';
import { useVerificationStore } from '../store/useVerificationStore';
import { CarPark, FloorSelectionResult } from '../types';
import { sampleBarometer, computeAltitude, computeFloor, ELEVATED_THRESHOLD_METRES } from '../services/barometer';
import { isInsideCarPark } from '../services/carParks';

const MELBOURNE = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export function MapScreen() {
  const [region, setRegion] = useState(MELBOURNE);
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [floorSheetVisible, setFloorSheetVisible] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedCarPark, setDetectedCarPark] = useState<CarPark | null>(null);
  const [detectedAltitude, setDetectedAltitude] = useState<number | null>(null);
  const [detectedFloor, setDetectedFloor] = useState<number | null>(null);

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
        setRegion((r) => ({
          ...r,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }));
      } catch {
        // Use default region when location is unavailable.
      }
    })();
  }, []);

  const launchVerification = async (floorData?: FloorSelectionResult) => {
    const pendingLoc = pendingLocRef.current;
    if (!pendingLoc) return;

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

      setRegion((r) => ({
        ...r,
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
      Alert.alert('Location unavailable', 'Could not start departure verification.');
    } finally {
      setDetecting(false);
    }
  };

  const handleFloorConfirmed = async (result: FloorSelectionResult) => {
    setFloorSheetVisible(false);
    await launchVerification(result);
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
            title="Free Spot"
            description="Shared by a Parking Karma user"
            pinColor="#FF6B35"
          />
        ))}
      </MapView>

      <FABButton onPress={handleLeaving} label={detecting ? 'CHECKING...' : "I'M LEAVING!"} />

      <FloorSelectionSheet
        visible={floorSheetVisible}
        carPark={detectedCarPark}
        altitude={detectedAltitude}
        estimatedFloor={detectedFloor}
        userId={user.id}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
