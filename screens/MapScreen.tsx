import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { FABButton } from '../components/FABButton';
import { useAppStore } from '../store/useAppStore';
import { useKarma } from '../hooks/useKarma';
import { ParkingSpot } from '../types';

const MELBOURNE = { latitude: -37.8136, longitude: 144.9631, latitudeDelta: 0.01, longitudeDelta: 0.01 };

export function MapScreen() {
  const [region, setRegion] = useState(MELBOURNE);
  const { spots, addSpot } = useAppStore();
  const { shareSpot } = useKarma();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setRegion((r) => ({ ...r, latitude: loc.coords.latitude, longitude: loc.coords.longitude }));
      } catch {
        // fall back to Melbourne default
      }
    })();
  }, []);

  const handleLeaving = () => {
    Alert.alert(
      'Share your spot?',
      "Pin your current location as a free spot and earn 10 karma points!",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '🚗 Share it!',
          onPress: async () => {
            try {
              const loc = await Location.getCurrentPositionAsync({});
              const spot: ParkingSpot = {
                id: `spot_${Date.now()}`,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                reportedBy: 'user_1',
                reportedAt: new Date(),
                active: true,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
              };
              addSpot(spot);
              shareSpot();
              Alert.alert('Spot shared! 🎉', 'You earned 10 karma points!');
            } catch {
              Alert.alert('Error', 'Could not get your location. Please try again.');
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
