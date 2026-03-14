import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Alert } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { FABButton } from "../components/FABButton";
import { useAppStore } from "../store/useAppStore";
import { useKarma } from "../hooks/useKarma";
import { ParkingSpot } from "../types";

const MELBOURNE = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
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
  const { startVerification, verificationStatus, baselinePressure } =
    useVerificationStore();

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

  const handleLeaving = () => {
    Alert.alert(
      "Share your spot?",
      "Pin your current location as a free spot and earn 10 karma points!",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "🚗 Share it!",
          onPress: async () => {
            try {
              const loc = await Location.getCurrentPositionAsync({});
              const spot: ParkingSpot = {
                id: `spot_${Date.now()}`,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                reportedBy: "user_1",
                reportedAt: new Date(),
                active: true,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
              };
              addSpot(spot);
              shareSpot();
              Alert.alert("Spot shared! 🎉", "You earned 10 karma points!");
            } catch {
              Alert.alert(
                "Error",
                "Could not get your location. Please try again.",
              );
            }
          },
        },
      ],
    );
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
            title="Free Spot!"
            description="Shared by a Parking Karma user"
            pinColor="#FF6B35"
          />
        ))}
      </MapView>
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
});
