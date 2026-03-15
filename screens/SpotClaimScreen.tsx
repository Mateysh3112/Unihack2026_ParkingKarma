import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  SafeAreaView,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { useAppStore } from "../store/useAppStore";
import { KARMA_REWARDS } from "../services/karma";
import { TIMEOUTS, haversineDistance, SPEED_GATES } from "../services/movement";
import { floorLabel } from "../services/barometer";
import {
  startTheftTracking,
  stopTheftTracking,
  updateSuspectLocation,
} from "../services/anticheat";
import { claimFirestoreSpot } from "../services/spots";
import { fetchNearestBay, NearestBayInfo } from "../services/parkingBays";

interface NearbySpot {
  id: string;
  sharerId: string;
  lat: number;
  lng: number;
  distance: number; // metres from user
  floor?: number; // signed int: 0=G, 1=Floor 1, -1=B1 …
  isMultiStorey?: boolean;
  carParkName?: string | null;
}

interface Props {
  visible: boolean;
  spot: NearbySpot | null;
  onClaimed: () => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Countdown ring — shows time remaining to claim (10 minutes)
// ---------------------------------------------------------------------------
function ClaimCountdown({ expiresIn }: { expiresIn: number }) {
  const mins = Math.floor(expiresIn / 60);
  const secs = expiresIn % 60;
  const urgent = expiresIn < 60;

  return (
    <View style={[styles.countdownRing, urgent && styles.countdownRingUrgent]}>
      <Text
        style={[styles.countdownText, urgent && styles.countdownTextUrgent]}
      >
        {mins}:{secs.toString().padStart(2, "0")}
      </Text>
      <Text style={styles.countdownLabel}>to claim</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function SpotClaimScreen({
  visible,
  spot,
  onClaimed,
  onDismiss,
}: Props) {
  const [claimed, setClaimed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expiresIn, setExpiresIn] = useState(600); // 10 minutes
  const [bayInfo, setBayInfo] = useState<NearestBayInfo | null>(null);

  const {
    user,
    addKarma,
    incrementSpotsUsed,
    applyParkingSinner,
    removeKarma,
  } = useAppStore();

  const isOwnSpot = !!user && !!spot && spot.sharerId === user.id;

  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideIn = useRef(new Animated.Value(300)).current;

  // Slide in on mount
  useEffect(() => {
    if (visible && spot && user) {
      setClaimed(false);
      setDismissed(false);
      setExpiresIn(600);
      setBayInfo(null);
      fetchNearestBay(spot.lat, spot.lng).then(setBayInfo);

      Animated.spring(slideIn, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();

      // Start claim countdown
      countdownRef.current = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            handleExpiry();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start theft tracking for this user
      startTheftTracking(
        user.id,
        spot.sharerId,
        spot.id,
        spot.lat,
        spot.lng,
        handleTheftDetected,
      );

      // Watch user's location to update theft tracker
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (loc) => {
          updateSuspectLocation(
            user.id,
            loc.coords.latitude,
            loc.coords.longitude,
          );
        },
      ).then((sub) => {
        locationSubRef.current = sub;
      });
    }

    return () => {
      cleanup();
    };
  }, [visible, spot?.id, user?.id]);

  const cleanup = useCallback(() => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (spot && user) stopTheftTracking(user.id);
  }, [spot, user?.id]);

  // ---------------------------------------------------------------------------
  // Theft detected — user was within 20m of spot but never claimed
  // ---------------------------------------------------------------------------
  const handleTheftDetected = useCallback(
    (thiefId: string, sharerId: string, spotId: string) => {
      if (claimed) return; // already claimed legitimately

      // Apply Parking Sinner debuff + karma penalty
      applyParkingSinner();
      removeKarma(Math.abs(KARMA_REWARDS.THEFT_PENALTY));

      Alert.alert(
        "We saw that. 👀",
        "Parking Sinner debuff applied. The karma gods are watching.",
        [{ text: "Noted.", onPress: onDismiss }],
      );
    },
    [claimed, applyParkingSinner, removeKarma, onDismiss],
  );

  // ---------------------------------------------------------------------------
  // 10-minute claim window expired with no action
  // ---------------------------------------------------------------------------
  const handleExpiry = useCallback(() => {
    if (!claimed && !dismissed) {
      onDismiss();
    }
  }, [claimed, dismissed, onDismiss]);

  // ---------------------------------------------------------------------------
  // User taps "Claimed!"
  // ---------------------------------------------------------------------------
  const handleClaim = async () => {
    if (!spot || !user) return;

    if (spot.sharerId === user.id) {
      Alert.alert(
        "Can't claim your own spot",
        "You created this spot, so you can't claim it. Share it with others instead.",
      );
      return;
    }

    // Cancel theft tracking — they claimed legitimately
    stopTheftTracking(user.id);
    cleanup();

    setClaimed(true);

    // Award karma to claimer
    addKarma(KARMA_REWARDS.SPOT_CLAIMED);
    incrementSpotsUsed();

    // Update Firestore
    try {
      await claimFirestoreSpot(spot.id, user.id);
    } catch {
      // offline — local state already updated
    }

    onClaimed();
  };

  // ---------------------------------------------------------------------------
  // User dismisses without claiming
  // ---------------------------------------------------------------------------
  const handleDismiss = () => {
    setDismissed(true);
    // Don't stop theft tracking — they dismissed but theft check still runs
    // cleanup only removes the location sub and countdown
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    onDismiss();
  };

  if (!spot) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.card, { transform: [{ translateY: slideIn }] }]}
        >
          <View style={styles.cardHandle} />

          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.spotEmoji}>🅿️</Text>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Spot Available!</Text>
              <Text style={styles.cardSubtitle}>
                {spot.distance < 1000
                  ? `${Math.round(spot.distance)}m away`
                  : `${(spot.distance / 1000).toFixed(1)}km away`}
              </Text>
            </View>
            <ClaimCountdown expiresIn={expiresIn} />
          </View>

          {/* Info rows */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText}>
              {bayInfo?.street_name
                ? bayInfo.street_name
                : `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`}
            </Text>
          </View>

          {/* Parking restrictions */}
          {bayInfo?.restrictions?.length ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>🅿</Text>
              <Text style={styles.infoText}>
                {bayInfo.restrictions[0].description ?? bayInfo.restrictions[0].typeDesc}
                {bayInfo.restrictions[0].durationMinutes
                  ? ` · ${bayInfo.restrictions[0].durationMinutes} min max`
                  : ""}
              </Text>
            </View>
          ) : null}

          {/* Meter info */}
          {bayInfo?.meter ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>💳</Text>
              <Text style={styles.infoText}>
                {[
                  bayInfo.meter.tapAndGo && "Tap & Go",
                  bayInfo.meter.cardAccepted && "Card accepted",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Paid parking"}
              </Text>
            </View>
          ) : null}

          {/* Floor / car park info — only shown for multi-storey spots */}
          {(spot.isMultiStorey ||
            (spot.floor !== undefined && spot.floor !== 0)) && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>🏢</Text>
              <Text style={styles.infoText}>
                {spot.carParkName ? `${spot.carParkName} · ` : ""}
                Floor {floorLabel(spot.floor ?? 0)}
              </Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoText}>
              Earn +{KARMA_REWARDS.SPOT_CLAIMED} karma for claiming
            </Text>
          </View>

          {/* Warning */}
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              👀 Don't take this spot without claiming it. We'll know.
            </Text>
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[
              styles.claimButton,
              isOwnSpot && styles.claimButtonDisabled,
            ]}
            onPress={handleClaim}
            disabled={isOwnSpot}
          >
            <Text style={styles.claimButtonText}>
              {isOwnSpot ? "Cannot Claim Your Own" : "CLAIM"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
          >
            <Text style={styles.dismissButtonText}>Not interested</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 12,
  },
  cardHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    alignSelf: "center",
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  spotEmoji: {
    fontSize: 40,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  cardSubtitle: {
    color: "#888",
    fontSize: 14,
    marginTop: 2,
  },
  countdownRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: "#FF9500",
    justifyContent: "center",
    alignItems: "center",
  },
  countdownRingUrgent: {
    borderColor: "#FF3B30",
  },
  countdownText: {
    color: "#FF9500",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  countdownTextUrgent: {
    color: "#FF3B30",
  },
  countdownLabel: {
    color: "#888",
    fontSize: 9,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#2A2A2A",
    padding: 12,
    borderRadius: 10,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoText: {
    color: "#CCCCCC",
    fontSize: 14,
    flex: 1,
  },
  warningBox: {
    backgroundColor: "#2A1F0A",
    borderWidth: 1,
    borderColor: "#FF9500",
    borderRadius: 10,
    padding: 12,
  },
  warningText: {
    color: "#FF9500",
    fontSize: 13,
    textAlign: "center",
  },
  claimButton: {
    backgroundColor: "#FF6B35",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  claimButtonDisabled: {
    backgroundColor: "#555",
  },
  claimButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  dismissButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  dismissButtonText: {
    color: "#888",
    fontSize: 14,
  },
});
