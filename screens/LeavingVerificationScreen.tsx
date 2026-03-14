import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  SafeAreaView,
} from 'react-native';
import { useVerificationStore } from '../store/useVerificationStore';
import { useAppStore } from '../store/useAppStore';
import { SPEED_GATES, SPEED_THRESHOLD_KMH, CONFIRMATION_DURATION_MS } from '../services/movement';
import { KARMA_REWARDS } from '../services/karma';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Animated dragon eye — pulses while monitoring
// ---------------------------------------------------------------------------
function DragonEye({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [active, pulse]);

  return (
    <Animated.Text style={[styles.dragonEmoji, { transform: [{ scale: pulse }] }]}>
      🐉
    </Animated.Text>
  );
}

// ---------------------------------------------------------------------------
// Speed gauge
// ---------------------------------------------------------------------------
function SpeedGauge({ speed }: { speed: number }) {
  const gaugeWidth = useRef(new Animated.Value(0)).current;
  const maxDisplaySpeed = 30; // km/h shown at 100%
  const target = Math.min(speed / maxDisplaySpeed, 1);

  useEffect(() => {
    Animated.timing(gaugeWidth, {
      toValue: target,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [target, gaugeWidth]);

  const color =
    speed < SPEED_GATES.STATIONARY_MAX
      ? '#FF3B30'
      : speed < SPEED_GATES.SUSPICIOUS_MAX
      ? '#FF9500'
      : '#34C759';

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeTrack}>
        <Animated.View
          style={[
            styles.gaugeFill,
            {
              width: gaugeWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.speedText, { color }]}>{speed.toFixed(1)} km/h</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Confirmation progress bar — fills over 10 seconds of sustained speed
// ---------------------------------------------------------------------------
function ConfirmationBar({ progress }: { progress: number }) {
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress, barWidth]);

  return (
    <View style={styles.confirmBarContainer}>
      <Text style={styles.confirmBarLabel}>
        Confirming departure… hold speed above {SPEED_THRESHOLD_KMH} km/h
      </Text>
      <View style={styles.confirmBarTrack}>
        <Animated.View
          style={[
            styles.confirmBarFill,
            { width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
      <Text style={styles.confirmBarPct}>{Math.round(progress * 100)}%</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Debug panel — only rendered in __DEV__ builds
// ---------------------------------------------------------------------------
function DebugPanel() {
  const {
    debugRawSpeedMs,
    currentSpeed,
    debugGpsAccuracy,
    debugGpsReadingCount,
    verificationStatus,
    debugLocationPermission,
  } = useVerificationStore();

  const rawKmh = debugRawSpeedMs !== null && debugRawSpeedMs >= 0
    ? debugRawSpeedMs * 3.6
    : 0;

  return (
    <View style={debugStyles.panel}>
      <Text style={debugStyles.title}>🛰 GPS Debug</Text>
      <Text style={debugStyles.row}>
        Raw speed: {debugRawSpeedMs !== null ? `${debugRawSpeedMs.toFixed(3)} m/s` : 'null'}
      </Text>
      <Text style={debugStyles.row}>Converted: {rawKmh.toFixed(2)} km/h</Text>
      <Text style={debugStyles.row}>Rolling avg: {currentSpeed.toFixed(2)} km/h</Text>
      <Text style={debugStyles.row}>
        Accuracy: {debugGpsAccuracy !== null ? `${debugGpsAccuracy.toFixed(1)} m` : 'n/a'}
      </Text>
      <Text style={debugStyles.row}>Readings: {debugGpsReadingCount}</Text>
      <Text style={debugStyles.row}>State: {verificationStatus}</Text>
      <Text style={debugStyles.row}>Permission: {debugLocationPermission}</Text>
    </View>
  );
}

const debugStyles = StyleSheet.create({
  panel: {
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#3A3A5C',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginTop: 8,
    gap: 2,
  },
  title: {
    color: '#7B7BFF',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
  },
  row: {
    color: '#AAAADD',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});

// ---------------------------------------------------------------------------
// Phase: Monitoring / Confirming
// ---------------------------------------------------------------------------
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
  const countdownColor = timeRemaining < 30 ? '#FF3B30' : '#888';
  const isConfirming = verificationStatus === 'confirming';

  return (
    <View style={styles.phaseContainer}>
      <DragonEye active />

      <Text style={styles.phaseTitle}>
        {isConfirming ? 'Almost There...' : 'Movement Verification'}
      </Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>

      <SpeedGauge speed={currentSpeed} />

      {isConfirming && <ConfirmationBar progress={confirmationProgress} />}

      {currentSpeed >= SPEED_GATES.STATIONARY_MAX && (
        <Text style={styles.directionText}>
          {isMovingAway ? '✅ Moving away from spot' : '⚠️ Direction unclear'}
        </Text>
      )}

      {accelPattern !== '' && (
        <Text style={styles.accelText}>📡 {accelPattern}</Text>
      )}

      {!isConfirming && <Text style={styles.passiveMsg}>{passiveMessage}</Text>}

      <Text style={[styles.countdown, { color: countdownColor }]}>
        ⏱ {mins}:{secs.toString().padStart(2, '0')} remaining
      </Text>

      {/* Speed gate legend */}
      <View style={styles.legend}>
        <LegendItem color="#FF3B30" label="0–2 km/h" desc="Stationary (auto-cancel)" />
        <LegendItem color="#FF9500" label="2–15 km/h" desc="Too slow" />
        <LegendItem color="#34C759" label="15+ km/h" desc="Confirming 🎉" />
      </View>

      {__DEV__ && <DebugPanel />}

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

function LegendItem({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>
        <Text style={{ fontWeight: '700' }}>{label}</Text> — {desc}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Phase: Broadcasting (waiting for claim)
// ---------------------------------------------------------------------------
function BroadcastingPhase() {
  const { statusMessage } = useVerificationStore();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.linear }),
    ).start();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.phaseContainer}>
      <Animated.Text style={[styles.dragonEmoji, { transform: [{ rotate }] }]}>🕐</Animated.Text>
      <Text style={styles.phaseTitle}>Spot Broadcast Live</Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>
      <Text style={styles.pendingKarmaText}>+{KARMA_REWARDS.SHARE_SPOT} karma pending</Text>
      <Text style={styles.broadcastSubtext}>
        Nearby drivers can see your spot. The karma gods are pleased.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Phase: Claimed
// ---------------------------------------------------------------------------
function ClaimedPhase({ onClose }: { onClose: () => void }) {
  const { statusMessage } = useVerificationStore();
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <View style={styles.phaseContainer}>
      <Animated.Text style={[styles.successEmoji, { transform: [{ scale }] }]}>🎉</Animated.Text>
      <Text style={styles.phaseTitle}>Spot Claimed!</Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>
      <View style={styles.karmaChip}>
        <Text style={styles.karmaChipText}>+{KARMA_REWARDS.SHARE_SPOT} Karma Awarded</Text>
      </View>
      <TouchableOpacity style={styles.doneButton} onPress={onClose}>
        <Text style={styles.doneButtonText}>Done ✓</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Phase: Expired / Cancelled / Stolen / Spoofing
// ---------------------------------------------------------------------------
function TerminalPhase({ onClose }: { onClose: () => void }) {
  const { statusMessage, spoofingDetected, claimStatus } = useVerificationStore();

  const emoji =
    claimStatus === 'stolen'
      ? '🐉'
      : spoofingDetected
      ? '⚡'
      : '😤';

  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.dragonEmoji}>{emoji}</Text>
      <Text style={styles.phaseTitle}>
        {claimStatus === 'stolen'
          ? 'Spot Stolen'
          : spoofingDetected
          ? 'Spoofing Detected'
          : 'No Karma This Time'}
      </Text>
      <Text style={styles.statusMsg}>{statusMessage}</Text>
      <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
        <Text style={styles.cancelButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Frozen account screen
// ---------------------------------------------------------------------------
function FrozenPhase({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.phaseContainer}>
      <Text style={styles.dragonEmoji}>❄️</Text>
      <Text style={styles.phaseTitle}>Karma Frozen</Text>
      <Text style={styles.statusMsg}>
        Your karma has been frozen. Reflect on your choices. ❄️
      </Text>
      <Text style={styles.broadcastSubtext}>
        3 failed verifications in 7 days. Freeze lifts in 48 hours.
      </Text>
      <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
        <Text style={styles.cancelButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Root screen component
// ---------------------------------------------------------------------------
export function LeavingVerificationScreen({ visible, onClose }: Props) {
  const {
    verificationStatus,
    claimStatus,
    isFrozen,
    spoofingDetected,
    cancelVerification,
    resetVerification,
    onSpotClaimed,
  } = useVerificationStore();

  const { addKarma, incrementSpotsShared } = useAppStore();

  // Award karma locally when claimed
  useEffect(() => {
    if (claimStatus === 'claimed') {
      addKarma(KARMA_REWARDS.SHARE_SPOT);
      incrementSpotsShared();
    }
  }, [claimStatus]);

  const handleClose = () => {
    resetVerification();
    onClose();
  };

  const handleCancel = () => {
    cancelVerification('manual');
  };

  // Determine which phase to render
  const renderPhase = () => {
    if (isFrozen) return <FrozenPhase onClose={handleClose} />;

    if (verificationStatus === 'monitoring' || verificationStatus === 'confirming') {
      return <MonitoringPhase onCancel={handleCancel} />;
    }

    if (verificationStatus === 'confirmed') {
      if (claimStatus === 'waiting') return <BroadcastingPhase />;
      if (claimStatus === 'claimed') return <ClaimedPhase onClose={handleClose} />;
      if (claimStatus === 'stolen') return <TerminalPhase onClose={handleClose} />;
      if (claimStatus === 'expired') return <TerminalPhase onClose={handleClose} />;
    }

    if (verificationStatus === 'cancelled') {
      return <TerminalPhase onClose={handleClose} />;
    }

    // idle / initial — shouldn't normally be visible
    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ParkingKarma 🅿️</Text>
          {(verificationStatus === 'idle' || verificationStatus === 'cancelled') && (
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.headerClose}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.content}>{renderPhase()}</View>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    color: '#FF6B35',
    fontSize: 18,
    fontWeight: '800',
  },
  headerClose: {
    color: '#888',
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  phaseContainer: {
    alignItems: 'center',
    gap: 16,
  },
  dragonEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  successEmoji: {
    fontSize: 80,
    marginBottom: 8,
  },
  phaseTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusMsg: {
    color: '#CCCCCC',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  passiveMsg: {
    color: '#FF9500',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  countdown: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  directionText: {
    color: '#AAAAAA',
    fontSize: 14,
    textAlign: 'center',
  },
  accelText: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  gaugeContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  gaugeTrack: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 6,
  },
  speedText: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  legend: {
    width: '100%',
    gap: 6,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: '#AAAAAA',
    fontSize: 13,
  },
  pendingKarmaText: {
    color: '#34C759',
    fontSize: 20,
    fontWeight: '700',
  },
  broadcastSubtext: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  karmaChip: {
    backgroundColor: '#34C759',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  karmaChipText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  confirmBarContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  confirmBarLabel: {
    color: '#34C759',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmBarTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1A3D2B',
    overflow: 'hidden',
  },
  confirmBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#34C759',
  },
  confirmBarPct: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cancelButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
  },
  cancelButtonText: {
    color: '#AAAAAA',
    fontWeight: '600',
    fontSize: 15,
  },
  doneButton: {
    marginTop: 16,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#34C759',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
