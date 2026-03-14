import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useVerificationStore } from "../store/useVerificationStore";
import { useAppStore } from "../store/useAppStore";
import { SPEED_GATES, SPEED_THRESHOLD_KMH } from "../services/movement";
import { KARMA_REWARDS } from "../services/karma";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function DebugPanel() {
  const {
    debugRawSpeedMs,
    currentSpeed,
    debugGpsAccuracy,
    debugGpsReadingCount,
    verificationStatus,
    debugLocationPermission,
  } = useVerificationStore();

  const convertedSpeedKmh =
    debugRawSpeedMs !== null && debugRawSpeedMs >= 0
      ? debugRawSpeedMs * 3.6
      : 0;

  return (
    <View style={styles.debugPanel}>
      <Text style={styles.debugTitle}>GPS Debug</Text>
      <Text style={styles.debugRow}>
        Raw GPS speed:{" "}
        {debugRawSpeedMs !== null
          ? `${debugRawSpeedMs.toFixed(3)} m/s`
          : "null"}
      </Text>
      <Text style={styles.debugRow}>
        Converted speed: {convertedSpeedKmh.toFixed(2)} km/h
      </Text>
      <Text style={styles.debugRow}>
        Rolling average: {currentSpeed.toFixed(2)} km/h
      </Text>
      <Text style={styles.debugRow}>
        GPS accuracy:{" "}
        {debugGpsAccuracy !== null ? `${debugGpsAccuracy.toFixed(1)} m` : "n/a"}
      </Text>
      <Text style={styles.debugRow}>GPS readings: {debugGpsReadingCount}</Text>
      <Text style={styles.debugRow}>State: {verificationStatus}</Text>
      <Text style={styles.debugRow}>Permission: {debugLocationPermission}</Text>
    </View>
  );
}

function SpeedGauge({ speed }: { speed: number }) {
  const width = useRef(new Animated.Value(0)).current;
  const target = Math.min(speed / 30, 1);

  useEffect(() => {
    Animated.timing(width, {
      toValue: target,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [target, width]);

  const color =
    speed < SPEED_GATES.STATIONARY_MAX
      ? "#FF3B30"
      : speed < SPEED_GATES.SUSPICIOUS_MAX
        ? "#FF9500"
        : "#34C759";

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeTrack}>
        <Animated.View
          style={[
            styles.gaugeFill,
            {
              width: width.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.speedText, { color }]}>{speed.toFixed(1)} km/h</Text>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: progress,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [progress, width]);

  return (
    <View style={styles.progressWrap}>
      <Text style={styles.progressLabel}>
        Suspicious window active. Reach {SPEED_THRESHOLD_KMH} km/h.
      </Text>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: width.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

function MonitoringPhase({ onCancel }: { onCancel: () => void }) {
  const {
    currentSpeed,
    isMovingAway,
    statusMessage,
    passiveMessage,
    timeRemaining,
    accelPattern,
    verificationStatus,
    confirmationProgress,
  } = useVerificationStore();
  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const isSuspicious =
    verificationStatus === "suspicious" || verificationStatus === "verified";

  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.hero}>CAR</Text>
      <Text style={styles.phaseTitle}>
        {verificationStatus === "verified"
          ? "Verified"
          : "Leaving Verification"}
      </Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>
      <SpeedGauge speed={currentSpeed} />
      {isSuspicious && <ProgressBar progress={confirmationProgress} />}
      <Text style={styles.secondary}>
        {isMovingAway
          ? "Moving away from tagged spot"
          : "Need distance away from tagged spot"}
      </Text>
      {accelPattern ? (
        <Text style={styles.secondary}>{accelPattern}</Text>
      ) : null}
      {!isSuspicious ? (
        <Text style={styles.passiveMsg}>{passiveMessage}</Text>
      ) : null}
      <Text style={styles.countdown}>
        {mins}:{secs.toString().padStart(2, "0")} remaining
      </Text>
      <View style={styles.legend}>
        <Text style={styles.legendText}>0-5 km/h: stationary or walking</Text>
        <Text style={styles.legendText}>5-15 km/h: suspicious window</Text>
        <Text style={styles.legendText}>15+ km/h: vehicle movement</Text>
      </View>
      {__DEV__ ? <DebugPanel /> : null}
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

function BroadcastingPhase() {
  const spin = useRef(new Animated.Value(0)).current;
  const { statusMessage } = useVerificationStore();

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.phaseContainer}>
      <Animated.Text style={[styles.hero, { transform: [{ rotate }] }]}>
        LIVE
      </Animated.Text>
      <Text style={styles.phaseTitle}>Spot Broadcast Live</Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>
      <Text style={styles.pendingKarma}>
        +{KARMA_REWARDS.SHARE_SPOT} karma pending until claimed
      </Text>
    </View>
  );
}

function ClaimedPhase({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.hero}>OK</Text>
      <Text style={styles.phaseTitle}>Spot Claimed</Text>
      <Text style={styles.statusMsg}>
        Your pending karma has been confirmed.
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
        <Text style={styles.primaryButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

function TerminalPhase({ onClose }: { onClose: () => void }) {
  const { statusMessage, verificationStatus } = useVerificationStore();

  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.hero}>
        {verificationStatus === "spoofed" ? "GPS" : "STOP"}
      </Text>
      <Text style={styles.phaseTitle}>
        {verificationStatus === "spoofed"
          ? "Spoofing Detected"
          : "Verification Stopped"}
      </Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>
      <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
        <Text style={styles.cancelButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

export function LeavingVerificationScreen({ visible, onClose }: Props) {
  const {
    verificationStatus,
    claimStatus,
    resetVerification,
    cancelVerification,
  } = useVerificationStore();
  const { addKarma, incrementSpotsShared } = useAppStore();

  useEffect(() => {
    if (claimStatus === "claimed") {
      addKarma(KARMA_REWARDS.SHARE_SPOT);
      incrementSpotsShared();
    }
  }, [claimStatus, addKarma, incrementSpotsShared]);

  const handleClose = () => {
    resetVerification();
    onClose();
  };

  const renderPhase = () => {
    if (
      verificationStatus === "monitoring" ||
      verificationStatus === "suspicious" ||
      verificationStatus === "verified"
    ) {
      return <MonitoringPhase onCancel={() => cancelVerification("manual")} />;
    }

    if (verificationStatus === "broadcasted") {
      if (claimStatus === "claimed")
        return <ClaimedPhase onClose={handleClose} />;
      return <BroadcastingPhase />;
    }

    if (
      verificationStatus === "cancelled" ||
      verificationStatus === "spoofed"
    ) {
      return <TerminalPhase onClose={handleClose} />;
    }

    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Parking Karma</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.headerClose}>X</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>{renderPhase()}</View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0D0D0D",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  headerTitle: {
    color: "#FF6B35",
    fontSize: 18,
    fontWeight: "800",
  },
  headerClose: {
    color: "#888",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  phaseContainer: {
    alignItems: "center",
    gap: 14,
  },
  hero: {
    fontSize: 42,
    fontWeight: "900",
    color: "#FF6B35",
  },
  phaseTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  statusMsg: {
    color: "#CCCCCC",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  secondary: {
    color: "#9D9D9D",
    fontSize: 13,
    textAlign: "center",
  },
  passiveMsg: {
    color: "#FF9500",
    fontSize: 14,
    textAlign: "center",
  },
  countdown: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  gaugeContainer: {
    width: "100%",
    gap: 8,
    alignItems: "center",
  },
  gaugeTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  gaugeFill: {
    height: "100%",
  },
  speedText: {
    fontSize: 22,
    fontWeight: "800",
  },
  progressWrap: {
    width: "100%",
    gap: 8,
  },
  progressLabel: {
    color: "#34C759",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#1A3D2B",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#34C759",
  },
  legend: {
    width: "100%",
    gap: 6,
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 12,
  },
  legendText: {
    color: "#B5B5B5",
    fontSize: 13,
  },
  pendingKarma: {
    color: "#34C759",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  debugPanel: {
    width: "100%",
    backgroundColor: "#141826",
    borderWidth: 1,
    borderColor: "#2A3352",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  debugTitle: {
    color: "#7BB3FF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  debugRow: {
    color: "#C9D6FF",
    fontSize: 12,
    fontFamily: "Courier New",
  },
  primaryButton: {
    backgroundColor: "#34C759",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  cancelButton: {
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#444",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cancelButtonText: {
    color: "#AAAAAA",
    fontSize: 15,
    fontWeight: "600",
  },
});
