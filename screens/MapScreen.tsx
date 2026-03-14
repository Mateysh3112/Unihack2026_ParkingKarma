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

// EXTREME RETRO — aged paper + pure black ink, Game Boy contrast, zero colour
const customMapStyle = [
  // ── Base: everything starts as aged paper ─────────────────────────────────
  { elementType: "geometry",           stylers: [{ color: "#E8DFC0" }] },
  { elementType: "geometry.stroke",    stylers: [{ color: "#0A0805" }] },

  // ── Labels: bold ink on paper, no icons ───────────────────────────────────
  { elementType: "labels.icon",        stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#0A0805" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#E8DFC0" }, { weight: 4 }] },

  // ── Landscape: darker parchment to separate from roads ────────────────────
  { featureType: "landscape",          elementType: "geometry", stylers: [{ color: "#DDD4B0" }] },
  { featureType: "landscape.natural",  elementType: "geometry", stylers: [{ color: "#D0C89A" }] },

  // ── Parks: hatched dark tone (simulated via darker fill) ──────────────────
  { featureType: "poi.park",           elementType: "geometry",          stylers: [{ color: "#B8B090" }] },
  { featureType: "poi.park",           elementType: "geometry.stroke",   stylers: [{ color: "#0A0805" }, { weight: 1 }] },
  { featureType: "poi.park",           elementType: "labels.text.fill",  stylers: [{ color: "#0A0805" }] },

  // ── All POI off except parks ───────────────────────────────────────────────
  { featureType: "poi",                stylers: [{ visibility: "off" }] },
  { featureType: "poi.park",           stylers: [{ visibility: "on" }] },

  // ── Local roads: thin scratchy lines ──────────────────────────────────────
  { featureType: "road.local",         elementType: "geometry",          stylers: [{ color: "#E8DFC0" }] },
  { featureType: "road.local",         elementType: "geometry.stroke",   stylers: [{ color: "#0A0805" }, { weight: 2 }] },
  { featureType: "road.local",         elementType: "labels",            stylers: [{ visibility: "off" }] },

  // ── Arterial roads: solid medium ink lines ────────────────────────────────
  { featureType: "road.arterial",      elementType: "geometry",          stylers: [{ color: "#0A0805" }] },
  { featureType: "road.arterial",      elementType: "geometry.stroke",   stylers: [{ color: "#E8DFC0" }, { weight: 1 }] },
  { featureType: "road.arterial",      elementType: "labels.text.fill",  stylers: [{ color: "#E8DFC0" }] },
  { featureType: "road.arterial",      elementType: "labels.text.stroke",stylers: [{ color: "#0A0805" }, { weight: 3 }] },

  // ── Highways: thick double-line — bold cartographic style ─────────────────
  { featureType: "road.highway",       elementType: "geometry",          stylers: [{ color: "#0A0805" }] },
  { featureType: "road.highway",       elementType: "geometry.stroke",   stylers: [{ color: "#E8DFC0" }, { weight: 2.5 }] },
  { featureType: "road.highway",       elementType: "labels.text.fill",  stylers: [{ color: "#E8DFC0" }] },
  { featureType: "road.highway",       elementType: "labels.text.stroke",stylers: [{ color: "#0A0805" }, { weight: 4 }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#0A0805" }] },

  // ── Transit: all off ──────────────────────────────────────────────────────
  { featureType: "transit",            stylers: [{ visibility: "off" }] },

  // ── Water: dark slate — like old ink-wash maps ────────────────────────────
  { featureType: "water",              elementType: "geometry",          stylers: [{ color: "#6E7E7A" }] },
  { featureType: "water",              elementType: "geometry.stroke",   stylers: [{ color: "#0A0805" }, { weight: 2 }] },
  { featureType: "water",              elementType: "labels.text.fill",  stylers: [{ color: "#E8DFC0" }] },
  { featureType: "water",              elementType: "labels.text.stroke",stylers: [{ color: "#0A0805" }] },

  // ── Administrative: heavy border lines like old atlas pages ───────────────
  { featureType: "administrative",                elementType: "geometry.stroke",   stylers: [{ color: "#0A0805" }, { weight: 2 }] },
  { featureType: "administrative.country",        elementType: "geometry.stroke",   stylers: [{ color: "#0A0805" }, { weight: 3 }] },
  { featureType: "administrative.locality",       elementType: "labels.text.fill",  stylers: [{ color: "#0A0805" }] },
  { featureType: "administrative.locality",       elementType: "labels.text.stroke",stylers: [{ color: "#E8DFC0" }, { weight: 4 }] },
  { featureType: "administrative.neighborhood",   elementType: "labels",            stylers: [{ visibility: "off" }] },
];
