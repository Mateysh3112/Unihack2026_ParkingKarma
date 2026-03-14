import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { createUnverifiedCarPark } from '../services/carParks';
import {
  floorLabel,
  allFloorOptions,
  ELEVATED_THRESHOLD_METRES,
} from '../services/barometer';
import { useAppStore } from '../store/useAppStore';
import { KARMA_REWARDS } from '../services/karma';
import { CarPark, FloorSelectionResult } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  visible: boolean;
  /** Pre-computed detection results from MapScreen (both run in parallel). */
  carPark: CarPark | null;
  altitude: number | null;          // null = barometer unavailable
  estimatedFloor: number | null;    // null = can't compute altitude
  userId: string;
  userLat: number;
  userLng: number;
  onConfirm: (result: FloorSelectionResult) => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Determine which UI state to show based on detection results
// ---------------------------------------------------------------------------
type UiPhase =
  | 'stateA_estimate'      // Known car park + barometer floor estimate
  | 'stateA_picker'        // Known car park, no estimate — go straight to picker
  | 'stateB'               // Unknown location, elevated — ask if multi-storey
  | 'picker'               // Manual floor picker (reached from A or B)
  | 'toast';               // "+5 karma" new car park toast

function resolvePhase(
  carPark: CarPark | null,
  altitude: number | null,
  estimatedFloor: number | null,
): UiPhase {
  if (carPark !== null) {
    return estimatedFloor !== null ? 'stateA_estimate' : 'stateA_picker';
  }
  if (altitude !== null && altitude > ELEVATED_THRESHOLD_METRES) {
    return 'stateB';
  }
  // Should not reach here — MapScreen short-circuits STATE C before showing sheet.
  // Defensive fallback: treat as ground level.
  return 'stateA_picker';
}

// ---------------------------------------------------------------------------
// Floor chip picker
// ---------------------------------------------------------------------------
function FloorPicker({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (floor: number) => void;
}) {
  const options = allFloorOptions();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map(({ label, floor }) => {
        const active = floor === selected;
        return (
          <TouchableOpacity
            key={floor}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(floor)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function FloorSelectionSheet({
  visible,
  carPark,
  altitude,
  estimatedFloor,
  userId,
  userLat,
  userLng,
  onConfirm,
  onDismiss,
}: Props) {
  const [phase, setPhase] = useState<UiPhase>(() =>
    resolvePhase(carPark, altitude, estimatedFloor),
  );
  const [selectedFloor, setSelectedFloor] = useState<number>(estimatedFloor ?? 0);
  // true when the user said "Yes" in STATE B (multi-storey, unknown location)
  const [creatingNewPark, setCreatingNewPark] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { addKarma } = useAppStore();
  const slideUp = useRef(new Animated.Value(500)).current;

  // Reset state whenever the sheet becomes visible
  useEffect(() => {
    if (!visible) return;
    const initial = resolvePhase(carPark, altitude, estimatedFloor);
    setPhase(initial);
    setSelectedFloor(estimatedFloor ?? 0);
    setCreatingNewPark(false);
    setSubmitting(false);
    Animated.spring(slideUp, {
      toValue: 0,
      tension: 50,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const slideDown = (cb: () => void) => {
    Animated.timing(slideUp, {
      toValue: 500,
      duration: 200,
      useNativeDriver: true,
    }).start(cb);
  };

  // ---------------------------------------------------------------------------
  // Confirm handlers
  // ---------------------------------------------------------------------------

  const confirmWithKnownCarPark = (floor: number) => {
    if (!carPark) return;
    slideDown(() =>
      onConfirm({
        floor,
        isMultiStorey: true,
        carParkId: carPark.id,
        carParkName: carPark.name,
        isNewCarPark: false,
      }),
    );
  };

  const confirmGround = () => {
    slideDown(() =>
      onConfirm({
        floor: 0,
        isMultiStorey: false,
        carParkId: null,
        carParkName: null,
        isNewCarPark: false,
      }),
    );
  };

  const confirmNewCarPark = async (floor: number) => {
    setSubmitting(true);
    try {
      const newId = await createUnverifiedCarPark(userLat, userLng, userId);
      addKarma(KARMA_REWARDS.CAR_PARK_DISCOVERY);
      // Show toast briefly then confirm
      setPhase('toast');
      setTimeout(() => {
        slideDown(() =>
          onConfirm({
            floor,
            isMultiStorey: true,
            carParkId: newId,
            carParkName: 'Unknown Car Park',
            isNewCarPark: true,
          }),
        );
      }, 1800);
    } catch {
      // Offline — still proceed, carParkId will be null
      slideDown(() =>
        onConfirm({
          floor,
          isMultiStorey: true,
          carParkId: null,
          carParkName: null,
          isNewCarPark: false,
        }),
      );
    }
  };

  const handlePickerConfirm = () => {
    if (submitting) return;
    if (creatingNewPark) {
      confirmNewCarPark(selectedFloor);
    } else {
      confirmWithKnownCarPark(selectedFloor);
    }
  };

  // ---------------------------------------------------------------------------
  // Render phases
  // ---------------------------------------------------------------------------

  const renderContent = () => {
    if (phase === 'toast') {
      return (
        <View style={styles.toastContainer}>
          <Text style={styles.toastEmoji}>🗺️</Text>
          <Text style={styles.toastTitle}>New Car Park Added!</Text>
          <Text style={styles.toastBody}>
            Thanks for helping the community. +{KARMA_REWARDS.CAR_PARK_DISCOVERY} karma awarded!
          </Text>
        </View>
      );
    }

    if (phase === 'picker' || phase === 'stateA_picker') {
      const heading = carPark
        ? `${carPark.name} 🏢`
        : 'Multi-Storey Car Park';

      return (
        <>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.subheading}>Which floor are you on?</Text>
          <FloorPicker selected={selectedFloor} onSelect={setSelectedFloor} />
          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handlePickerConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Confirm — Floor {floorLabel(selectedFloor)}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={onDismiss}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (phase === 'stateA_estimate' && carPark) {
      return (
        <>
          <Text style={styles.emoji}>🏢</Text>
          <Text style={styles.heading}>Looks like you're at</Text>
          <Text style={styles.carParkName}>{carPark.name}</Text>
          <Text style={styles.subheading}>
            We think you're on Floor {floorLabel(estimatedFloor!)}. Is that right?
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => confirmWithKnownCarPark(estimatedFloor!)}
          >
            <Text style={styles.primaryBtnText}>
              Yes, Floor {floorLabel(estimatedFloor!)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              setCreatingNewPark(false);
              setSelectedFloor(estimatedFloor ?? 0);
              setPhase('picker');
            }}
          >
            <Text style={styles.secondaryBtnText}>No, let me pick</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={onDismiss}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </>
      );
    }

    if (phase === 'stateB') {
      return (
        <>
          <Text style={styles.emoji}>🏢</Text>
          <Text style={styles.heading}>Are you in a multi-storey car park?</Text>
          <Text style={styles.subheading}>
            We've detected you might be elevated. Help others find your spot!
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setCreatingNewPark(true);
              setSelectedFloor(estimatedFloor ?? 1);
              setPhase('picker');
            }}
          >
            <Text style={styles.primaryBtnText}>Yes, I'm in a car park</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={confirmGround}>
            <Text style={styles.secondaryBtnText}>No, I'm on the street</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={onDismiss}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </>
      );
    }

    return null;
  };

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideUp }] }]}
        >
          <View style={styles.handle} />
          {renderContent()}
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
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    gap: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    marginBottom: 12,
  },
  emoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  carParkName: {
    color: '#FF6B35',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -4,
  },
  subheading: {
    color: '#AAAAAA',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
  },
  chipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  chipText: {
    color: '#AAAAAA',
    fontSize: 15,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryBtn: {
    width: '100%',
    backgroundColor: '#2A2A2A',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  secondaryBtnText: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: '#666',
    fontSize: 14,
  },
  toastContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  toastEmoji: {
    fontSize: 60,
  },
  toastTitle: {
    color: '#34C759',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  toastBody: {
    color: '#AAAAAA',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
