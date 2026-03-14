import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { FABButton } from '../components/FABButton';
import { useAppStore } from '../store/useAppStore';
import { useKarma } from '../hooks/useKarma';
import { ParkingSpot } from '../types';
import { PD } from '../theme';

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
      'SHARE YOUR SPOT?',
      'Pin your current location as a free spot and earn 10 karma points!',
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'SHARE IT',
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
              Alert.alert('SPOT SHARED', 'You earned 10 karma points!');
            } catch {
              Alert.alert('ERROR', 'Could not get your location. Please try again.');
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
            title="FREE SPOT"
            description="Shared by a Parking Karma user"
            pinColor={PD.accent}
          />
        ))}
      </MapView>

      {/* Spot count HUD — top-left overlay */}
      {spots.length > 0 && (
        <View style={styles.hudShadow}>
          <View style={styles.hud}>
            <Text style={styles.hudText}>{spots.length} ACTIVE SPOT{spots.length !== 1 ? 'S' : ''}</Text>
          </View>
        </View>
      )}

      <FABButton onPress={handleLeaving} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  hudShadow: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: PD.border,
    transform: [{ translateX: 3 }, { translateY: 3 }],
  },
  hud: {
    backgroundColor: PD.bg,
    borderWidth: 2,
    borderColor: PD.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    transform: [{ translateX: -3 }, { translateY: -3 }],
  },
  hudText: {
    fontFamily: PD.fontMono,
    fontWeight: '900',
    fontSize: 11,
    color: PD.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
