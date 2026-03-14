import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import * as Location from "expo-location";
import { FABButton } from "../components/FABButton";
import { useAppStore } from "../store/useAppStore";
import { useKarma } from "../hooks/useKarma";
import { ParkingSpot } from "../types";
import { PD } from "../theme";

const MELBOURNE = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export function MapScreen() {
  const [region, setRegion] = useState(MELBOURNE);
  const { spots, addSpot } = useAppStore();
  const { shareSpot } = useKarma();
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
      "SHARE YOUR SPOT?",
      "Pin your current location as a free spot and earn 10 karma points!",
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "SHARE IT",
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
              Alert.alert("SPOT SHARED", "You earned 10 karma points!");
            } catch {
              Alert.alert(
                "ERROR",
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
        provider={PROVIDER_GOOGLE}
        region={region}
        showsUserLocation
        showsMyLocationButton
        customMapStyle={customMapStyle}
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            title="FREE SPOT"
            description="Shared by a Parking Karma user"
            // pinColor={PD.accent}
          >
            <View style={styles.orangeMarker} />
          </Marker>
        ))}
      </MapView>

      {/* Spot count HUD — top-left overlay */}
      {spots.length > 0 && (
        <View style={styles.hudShadow}>
          <View style={styles.hud}>
            <Text style={styles.hudText}>
              {spots.length} ACTIVE SPOT{spots.length !== 1 ? "S" : ""}
            </Text>
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
    position: "absolute",
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
    fontWeight: "900",
    fontSize: 11,
    color: PD.ink,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  neonMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ff00ff",
    borderWidth: 2,
    borderColor: "#00ffff",

    shadowColor: "#ff00ff",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },

    elevation: 10,
  },
  orangeMarker: {
    width: 16,
    height: 16,
    borderRadius: 0,
    backgroundColor: PD.accent,

    borderWidth: 2,
    borderColor: "#1a1a1a",

    shadowOpacity: 0,
    elevation: 0,
  },
});

// Playdate-inspired map style — newsprint cream base, near-black ink roads
const customMapStyle = [
  // ── Base geometry ──────────────────────────────────────────────────────────
  { elementType: "geometry",            stylers: [{ color: "#F2ECD8" }] }, // PD.bg newsprint
  { elementType: "labels.text.fill",    stylers: [{ color: "#1A1714" }] }, // PD.ink
  { elementType: "labels.text.stroke",  stylers: [{ color: "#F2ECD8" }, { weight: 3 }] },
  { elementType: "labels.icon",         stylers: [{ visibility: "on" }, { saturation: -100 }] },

  // ── Landscape ──────────────────────────────────────────────────────────────
  { featureType: "landscape",           elementType: "geometry",        stylers: [{ color: "#EDE6CE" }] },
  { featureType: "landscape.man_made",  elementType: "geometry",        stylers: [{ color: "#E5DEC4" }] },

  // ── Parks / green areas ────────────────────────────────────────────────────
  { featureType: "poi.park",            elementType: "geometry",        stylers: [{ color: "#D8D0B4" }] },
  { featureType: "poi.park",            elementType: "labels.text.fill",stylers: [{ color: "#5C554A" }] },

  // ── All other POI — hidden to reduce clutter ───────────────────────────────
  { featureType: "poi",                 stylers: [{ visibility: "off" }] },
  { featureType: "poi.park",            stylers: [{ visibility: "on" }] },

  // ── Roads ──────────────────────────────────────────────────────────────────
  { featureType: "road",                elementType: "geometry",        stylers: [{ color: "#1A1714" }] },
  { featureType: "road",                elementType: "geometry.stroke", stylers: [{ color: "#1A1714" }, { weight: 0.5 }] },
  { featureType: "road",                elementType: "labels.text.fill",stylers: [{ color: "#F2ECD8" }] },
  { featureType: "road",                elementType: "labels.text.stroke",stylers:[{ color: "#1A1714" }, { weight: 2 }] },

  // Arterial roads — slightly thinner weight
  { featureType: "road.arterial",       elementType: "geometry",        stylers: [{ color: "#3A342E" }] },

  // Local roads — lightest
  { featureType: "road.local",          elementType: "geometry",        stylers: [{ color: "#5C554A" }] },
  { featureType: "road.local",          elementType: "labels.text.fill",  stylers: [{ color: "#5C554A" }] },
  { featureType: "road.local",          elementType: "labels.text.stroke",stylers: [{ color: "#F2ECD8" }, { weight: 2 }] },

  // Highways — bold ink lines
  { featureType: "road.highway",        elementType: "geometry",        stylers: [{ color: "#1A1714" }, { weight: 2 }] },
  { featureType: "road.highway",        elementType: "geometry.stroke", stylers: [{ color: "#F2ECD8" }, { weight: 1 }] },
  { featureType: "road.highway",        elementType: "labels.text.fill",stylers: [{ color: "#F2ECD8" }] },

  // ── Transit — hidden ───────────────────────────────────────────────────────
  { featureType: "transit",             stylers: [{ visibility: "off" }] },

  // ── Water ─────────────────────────────────────────────────────────────────
  { featureType: "water",               elementType: "geometry",        stylers: [{ color: "#C4BAA0" }] },
  { featureType: "water",               elementType: "labels.text.fill",stylers: [{ color: "#5C554A" }] },

  // ── Administrative borders ─────────────────────────────────────────────────
  { featureType: "administrative",      elementType: "geometry.stroke", stylers: [{ color: "#1A1714" }, { weight: 1.5 }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1A1714" }] },
];
