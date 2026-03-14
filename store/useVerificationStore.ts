import { create } from 'zustand';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import {
  SPEED_GATES,
  SPEED_THRESHOLD_KMH,
  WALKING_SPEED_KMH,
  STATIONARY_SPEED_KMH,
  CONFIRMATION_DURATION_MS,
  STATIONARY_CANCEL_MS,
  RECONFIRM_PAUSE_MS,
  ROLLING_BUFFER_SIZE,
  TIMEOUTS,
  PASSIVE_AGGRESSIVE_MESSAGES,
  calcSpeedKmh,
  isMovingAwayFromSpot,
  detectSpoofing,
  analyzeAccelerometerPattern,
  rollingAverage,
} from '../services/movement';
import { checkCooldownFraud, recordFailedVerification } from '../services/anticheat';
import { createFirestoreSpot, updateSpotStatus } from '../services/spots';
import { AccelerometerReading, FloorSelectionResult, VerificationStatus, ClaimStatus } from '../types';

// ---------------------------------------------------------------------------
// Subscription refs — held outside state so they're never serialised
// ---------------------------------------------------------------------------
let _locationSub: Location.LocationSubscription | null = null;
let _accelSub: { remove: () => void } | null = null;
let _monitoringTimer: ReturnType<typeof setTimeout> | null = null;
let _claimTimer: ReturnType<typeof setTimeout> | null = null;
let _passiveTimer: ReturnType<typeof setInterval> | null = null;
let _reconfirmTimer: ReturnType<typeof setTimeout> | null = null;
let _accelReadings: AccelerometerReading[] = [];
let _gpsReadingCount = 0;

// Speed verification tracking
let _speedBuffer: number[] = [];          // rolling buffer of last N GPS speeds
let _confirmationStart: number | null = null;  // timestamp when confirming window began
let _stationaryStart: number | null = null;    // timestamp when stationary period began

// Previous location snapshot for speed/direction calc
let _prevLoc: { lat: number; lng: number; ts: number } | null = null;
let _passiveMsgIndex = 0;

function clearAllTimers() {
  if (_monitoringTimer) { clearTimeout(_monitoringTimer); _monitoringTimer = null; }
  if (_claimTimer) { clearTimeout(_claimTimer); _claimTimer = null; }
  if (_passiveTimer) { clearInterval(_passiveTimer); _passiveTimer = null; }
  if (_reconfirmTimer) { clearTimeout(_reconfirmTimer); _reconfirmTimer = null; }
}

function clearAllSubscriptions() {
  _locationSub?.remove();
  _locationSub = null;
  _accelSub?.remove();
  _accelSub = null;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------
interface VerificationStore {
  verificationStatus: VerificationStatus;
  currentSpeed: number;
  isMovingAway: boolean;
  strikeCount: number;
  isFrozen: boolean;
  pendingKarma: number;
  statusMessage: string;
  passiveMessage: string;
  spotId: string | null;
  spotLocation: { lat: number; lng: number } | null;
  claimStatus: ClaimStatus;
  timeRemaining: number;       // seconds left in monitoring phase
  spoofingDetected: boolean;
  accelPattern: string;

  confirmationProgress: number;  // 0–1, how far through the 10s confirmation window

  // Debug fields — populated in __DEV__ builds
  debugRawSpeedMs: number | null;
  debugGpsAccuracy: number | null;
  debugGpsReadingCount: number;
  debugLocationPermission: string;

  // Multi-storey / floor fields (Part 6)
  isMultiStorey: boolean;
  detectedFloor: number | null;   // barometer estimate (may differ from confirmed)
  confirmedFloor: number | null;  // user-selected floor
  carParkId: string | null;
  carParkName: string | null;
  baselinePressure: number | null; // hPa — captured at ground level on app launch
  currentAltitude: number | null;  // metres above baseline at time of tap

  // Actions
  startVerification: (userId: string, lat: number, lng: number, floorData?: FloorSelectionResult) => Promise<void>;
  cancelVerification: (reason?: string) => void;
  onSpotClaimed: (claimerId: string) => void;
  onSpotExpired: () => void;
  onSpotStolen: () => void;
  setBroadcasting: () => void;
  resetVerification: () => void;
  _setTimeRemaining: (s: number) => void;
  _setSpeed: (kmh: number, movingAway: boolean) => void;
  _setPassiveMessage: (msg: string) => void;
  _setSpoofing: (detected: boolean) => void;
  _setAccelPattern: (pattern: string) => void;
  _setConfirmationProgress: (p: number) => void;
  _setDebugInfo: (rawMs: number | null, accuracy: number | null, count: number) => void;
  setBaselinePressure: (hpa: number) => void;
  setCurrentAltitude: (m: number) => void;
}

export const useVerificationStore = create<VerificationStore>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------
  verificationStatus: 'idle',
  currentSpeed: 0,
  isMovingAway: false,
  strikeCount: 0,
  isFrozen: false,
  pendingKarma: 15,
  statusMessage: '',
  passiveMessage: PASSIVE_AGGRESSIVE_MESSAGES[0],
  spotId: null,
  spotLocation: null,
  claimStatus: null,
  timeRemaining: 180,
  spoofingDetected: false,
  accelPattern: '',
  confirmationProgress: 0,
  debugRawSpeedMs: null,
  debugGpsAccuracy: null,
  debugGpsReadingCount: 0,
  debugLocationPermission: 'unknown',
  isMultiStorey: false,
  detectedFloor: null,
  confirmedFloor: null,
  carParkId: null,
  carParkName: null,
  baselinePressure: null,
  currentAltitude: null,

  // ---------------------------------------------------------------------------
  // Internal setters (called from subscription callbacks)
  // ---------------------------------------------------------------------------
  _setTimeRemaining: (s) => set({ timeRemaining: s }),
  _setSpeed: (kmh, movingAway) => set({ currentSpeed: kmh, isMovingAway: movingAway }),
  _setPassiveMessage: (msg) => set({ passiveMessage: msg }),
  _setSpoofing: (detected) => set({ spoofingDetected: detected }),
  _setAccelPattern: (pattern) => set({ accelPattern: pattern }),
  _setConfirmationProgress: (p) => set({ confirmationProgress: p }),
  _setDebugInfo: (rawMs, accuracy, count) => set({
    debugRawSpeedMs: rawMs,
    debugGpsAccuracy: accuracy,
    debugGpsReadingCount: count,
  }),
  setBaselinePressure: (hpa) => set({ baselinePressure: hpa }),
  setCurrentAltitude: (m) => set({ currentAltitude: m }),

  // ---------------------------------------------------------------------------
  // startVerification — called when user taps "I'm Leaving"
  // ---------------------------------------------------------------------------
  startVerification: async (userId, lat, lng, floorData?) => {
    const state = get();

    // Guard: frozen account
    if (state.isFrozen) {
      set({ statusMessage: "Your karma has been frozen. Reflect on your choices. ❄️" });
      return;
    }

    // Guard: location permission
    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus !== 'granted') {
      set({
        verificationStatus: 'cancelled',
        statusMessage: 'Location permission denied. Please grant location access in Settings.',
        debugLocationPermission: locStatus,
      });
      return;
    }
    set({ debugLocationPermission: locStatus });

    // Guard: cooldown fraud
    const fraudFlagged = checkCooldownFraud(userId, lat, lng);
    if (fraudFlagged) {
      set({
        verificationStatus: 'cancelled',
        statusMessage: "Too many tags at this location. The karma gods are suspicious. 🐉",
      });
      return;
    }

    // Reset state for new verification
    clearAllTimers();
    clearAllSubscriptions();
    _prevLoc = null;
    _accelReadings = [];
    _passiveMsgIndex = 0;
    _speedBuffer = [];
    _confirmationStart = null;
    _stationaryStart = null;
    _gpsReadingCount = 0;

    set({
      verificationStatus: 'monitoring',
      spotLocation: { lat, lng },
      spotId: null,
      currentSpeed: 0,
      isMovingAway: false,
      claimStatus: null,
      timeRemaining: 180,
      spoofingDetected: false,
      accelPattern: '',
      confirmationProgress: 0,
      statusMessage: 'Verifying your departure... 🚗',
      passiveMessage: PASSIVE_AGGRESSIVE_MESSAGES[0],
      // Floor / car park data from the pre-verification detection step
      isMultiStorey: floorData?.isMultiStorey ?? false,
      confirmedFloor: floorData?.floor ?? null,
      carParkId: floorData?.carParkId ?? null,
      carParkName: floorData?.carParkName ?? null,
      detectedFloor: null,
    });

    // Create Firestore spot document (non-blocking — UI continues immediately)
    createFirestoreSpot(userId, lat, lng, floorData)
      .then((id) => set({ spotId: id }))
      .catch(() => {
        // Offline mode — generate local ID
        set({ spotId: `local_${Date.now()}` });
      });

    // -------------------------------------------------------------------------
    // 3-minute hard deadline — no movement = cancel
    // -------------------------------------------------------------------------
    const monitorStart = Date.now();
    _monitoringTimer = setTimeout(() => {
      const s = get();
      if (s.verificationStatus === 'monitoring') {
        get().cancelVerification('timeout');
      }
    }, TIMEOUTS.MAX_MONITORING_MS);

    // -------------------------------------------------------------------------
    // Countdown ticker + passive message rotation (1s intervals)
    // -------------------------------------------------------------------------
    _passiveTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - monitorStart) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      get()._setTimeRemaining(remaining);

      // Rotate passive messages every 30 seconds
      if (elapsed > 0 && elapsed % 30 === 0) {
        _passiveMsgIndex = (_passiveMsgIndex + 1) % PASSIVE_AGGRESSIVE_MESSAGES.length;
        get()._setPassiveMessage(PASSIVE_AGGRESSIVE_MESSAGES[_passiveMsgIndex]);
      }
    }, 1000);

    // -------------------------------------------------------------------------
    // Accelerometer subscription
    // -------------------------------------------------------------------------
    Accelerometer.setUpdateInterval(500);
    _accelSub = Accelerometer.addListener(({ x, y, z }) => {
      _accelReadings.push({ x, y, z, timestamp: Date.now() });
      if (_accelReadings.length > 20) _accelReadings.shift(); // keep rolling 10s window

      if (_accelReadings.length >= 5) {
        const { reason } = analyzeAccelerometerPattern(_accelReadings);
        get()._setAccelPattern(reason);
      }
    });

    // -------------------------------------------------------------------------
    // GPS watch — BestForNavigation required for reliable speed data
    // -------------------------------------------------------------------------
    try {
      _locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          const { verificationStatus, spotLocation } = get();
          if (!spotLocation) return;
          // Keep processing during monitoring, confirming, and confirmed (for post-broadcast check)
          if (
            verificationStatus !== 'monitoring' &&
            verificationStatus !== 'confirming' &&
            verificationStatus !== 'confirmed'
          ) return;

          const curr = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            ts: loc.timestamp,
          };

          _gpsReadingCount++;

          // Spoofing check (requires previous point)
          if (_prevLoc) {
            const spoofed = detectSpoofing(
              _prevLoc.lat, _prevLoc.lng, _prevLoc.ts,
              curr.lat, curr.lng, curr.ts,
            );
            if (spoofed) {
              get()._setSpoofing(true);
              get().cancelVerification('spoof');
              return;
            }
          }

          // GPS-native speed is the primary source — multiply by 3.6 for km/h.
          // Falls back to haversine when the OS returns null (common when stationary
          // or before GPS lock). On the very first reading with no GPS speed and no
          // previous point, store the point and wait for the next one.
          const rawSpeedMs = loc.coords.speed;
          const gpsAccuracy = loc.coords.accuracy;

          if (__DEV__) {
            get()._setDebugInfo(rawSpeedMs, gpsAccuracy, _gpsReadingCount);
          }

          let rawSpeedKmh: number;
          if (rawSpeedMs !== null && rawSpeedMs >= 0) {
            rawSpeedKmh = rawSpeedMs * 3.6;
          } else if (_prevLoc) {
            rawSpeedKmh = calcSpeedKmh(
              _prevLoc.lat, _prevLoc.lng, _prevLoc.ts,
              curr.lat, curr.lng, curr.ts,
            );
          } else {
            // First reading with no GPS speed — store point and wait
            _prevLoc = curr;
            return;
          }

          const movingAway = _prevLoc
            ? isMovingAwayFromSpot(
                spotLocation.lat, spotLocation.lng,
                _prevLoc.lat, _prevLoc.lng,
                curr.lat, curr.lng,
              )
            : false;

          // Rolling average — smooths GPS jitter and prevents false triggers
          _speedBuffer.push(rawSpeedKmh);
          if (_speedBuffer.length > ROLLING_BUFFER_SIZE) _speedBuffer.shift();
          const avgSpeed = rollingAverage(_speedBuffer);

          get()._setSpeed(avgSpeed, movingAway);
          _prevLoc = curr;

          const now = Date.now();

          // ---------------------------------------------------------------
          // Pre-broadcast: monitoring / confirming states
          // ---------------------------------------------------------------
          if (verificationStatus === 'monitoring' || verificationStatus === 'confirming') {
            // Stationary cancel — stopped for too long after tapping "I'm Leaving"
            if (avgSpeed < STATIONARY_SPEED_KMH) {
              if (_stationaryStart === null) _stationaryStart = now;
              if (now - _stationaryStart >= STATIONARY_CANCEL_MS) {
                get().cancelVerification('no_movement');
                return;
              }
            } else {
              _stationaryStart = null;
            }

            if (avgSpeed >= SPEED_THRESHOLD_KMH) {
              // Fast enough — advance or maintain confirmation window
              _stationaryStart = null;

              if (_confirmationStart === null) {
                // Start the confirmation window
                _confirmationStart = now;
                set({ verificationStatus: 'confirming' });
              }

              const elapsed = now - _confirmationStart;
              const progress = Math.min(elapsed / CONFIRMATION_DURATION_MS, 1);
              get()._setConfirmationProgress(progress);

              const secsLeft = Math.ceil((CONFIRMATION_DURATION_MS - elapsed) / 1000);
              set({ statusMessage: `Keep going! Confirming in ${secsLeft}s... 🚗` });

              if (elapsed >= CONFIRMATION_DURATION_MS) {
                // Sustained 15+ km/h for full window — broadcast the spot
                get().setBroadcasting();
              }
            } else {
              // Below threshold — reset confirmation window
              if (_confirmationStart !== null) {
                _confirmationStart = null;
                get()._setConfirmationProgress(0);
                if (get().verificationStatus === 'confirming') {
                  set({ verificationStatus: 'monitoring' });
                }
              }

              if (avgSpeed < WALKING_SPEED_KMH) {
                set({ statusMessage: "You've slowed down. Are you still leaving? 🤨" });
              } else {
                set({ statusMessage: "Slow movement... speed up to confirm departure 🚗" });
              }
            }
          }

          // ---------------------------------------------------------------
          // Post-broadcast: watch for speed dropping below walking speed
          // (re-read status — it may have just changed to 'confirmed' above)
          // ---------------------------------------------------------------
          if (get().verificationStatus === 'confirmed' && get().claimStatus === 'waiting') {
            if (avgSpeed < WALKING_SPEED_KMH && !_reconfirmTimer) {
              set({ statusMessage: "You've slowed down. Are you still leaving? 🤨" });
              _reconfirmTimer = setTimeout(() => {
                _reconfirmTimer = null;
                const s = get();
                if (s.claimStatus === 'waiting') {
                  set({ statusMessage: "Waiting for someone to claim your spot... 🕐" });
                }
              }, RECONFIRM_PAUSE_MS);
            } else if (avgSpeed >= WALKING_SPEED_KMH && _reconfirmTimer) {
              clearTimeout(_reconfirmTimer);
              _reconfirmTimer = null;
              set({ statusMessage: "Waiting for someone to claim your spot... 🕐" });
            }
          }
        },
      );
    } catch (err) {
      set({
        verificationStatus: 'cancelled',
        statusMessage: 'Location access failed. Please grant location permissions.',
      });
      clearAllTimers();
    }
  },

  // ---------------------------------------------------------------------------
  // setBroadcasting — called when speed gate is cleared
  // ---------------------------------------------------------------------------
  setBroadcasting: () => {
    const { verificationStatus, spotId } = get();
    if (verificationStatus !== 'monitoring' && verificationStatus !== 'confirming') return;

    clearAllTimers();
    // Keep _locationSub alive — we continue monitoring speed post-broadcast
    // (to detect if the user stops and needs re-confirmation)
    _accelSub?.remove();
    _accelSub = null;

    set({
      verificationStatus: 'confirmed',
      claimStatus: 'waiting',
      confirmationProgress: 1,
      statusMessage: "Waiting for someone to claim your spot... 🕐",
    });

    if (spotId) {
      updateSpotStatus(spotId, 'broadcasting').catch(() => {});
    }

    // 10-minute claim window
    _claimTimer = setTimeout(() => {
      const s = get();
      if (s.claimStatus === 'waiting') {
        get().onSpotExpired();
      }
    }, TIMEOUTS.CLAIM_WINDOW_MS);
  },

  // ---------------------------------------------------------------------------
  // cancelVerification
  // ---------------------------------------------------------------------------
  cancelVerification: (reason = 'manual') => {
    clearAllTimers();
    clearAllSubscriptions();

    const { spotId } = get();
    if (spotId) {
      updateSpotStatus(spotId, 'expired').catch(() => {});
    }

    let statusMessage: string;
    if (reason === 'timeout') {
      statusMessage = "Spot cancelled. No karma for you. The parking gods are disappointed. 🐉";
    } else if (reason === 'spoof') {
      statusMessage = "GPS spoofing detected. The karma gods see everything. ⚡ Parking Sinner debuff applied.";
    } else if (reason === 'no_movement') {
      statusMessage = "You didn't move. The parking gods are not impressed. 🐉";
    } else {
      statusMessage = "Spot cancelled.";
    }

    set({
      verificationStatus: 'cancelled',
      claimStatus: null,
      statusMessage,
    });
  },

  // ---------------------------------------------------------------------------
  // onSpotClaimed — called when a nearby driver claims the spot
  // ---------------------------------------------------------------------------
  onSpotClaimed: (claimerId) => {
    if (_claimTimer) { clearTimeout(_claimTimer); _claimTimer = null; }

    set({
      claimStatus: 'claimed',
      statusMessage: "Your spot was claimed! +15 karma awarded 🎉",
    });
  },

  // ---------------------------------------------------------------------------
  // onSpotExpired — 10-min window with no claim
  // ---------------------------------------------------------------------------
  onSpotExpired: () => {
    const { spotId } = get();
    if (spotId) {
      updateSpotStatus(spotId, 'expired').catch(() => {});
    }
    set({
      claimStatus: 'expired',
      statusMessage: "No one claimed your spot. Better luck next time. ⏳",
    });
  },

  // ---------------------------------------------------------------------------
  // onSpotStolen
  // ---------------------------------------------------------------------------
  onSpotStolen: () => {
    set({
      claimStatus: 'stolen',
      statusMessage: "Someone stole your spot. Justice has been served. No karma lost on your end. 🐉",
    });
  },

  // ---------------------------------------------------------------------------
  // resetVerification — return to idle
  // ---------------------------------------------------------------------------
  resetVerification: () => {
    clearAllTimers();
    clearAllSubscriptions();
    _prevLoc = null;
    _accelReadings = [];
    _passiveMsgIndex = 0;
    _speedBuffer = [];
    _confirmationStart = null;
    _stationaryStart = null;
    _gpsReadingCount = 0;

    set({
      verificationStatus: 'idle',
      currentSpeed: 0,
      isMovingAway: false,
      claimStatus: null,
      statusMessage: '',
      passiveMessage: PASSIVE_AGGRESSIVE_MESSAGES[0],
      spotId: null,
      spotLocation: null,
      timeRemaining: 180,
      spoofingDetected: false,
      accelPattern: '',
      confirmationProgress: 0,
      debugRawSpeedMs: null,
      debugGpsAccuracy: null,
      debugGpsReadingCount: 0,
      debugLocationPermission: 'unknown',
      isMultiStorey: false,
      detectedFloor: null,
      confirmedFloor: null,
      carParkId: null,
      carParkName: null,
      currentAltitude: null,
    });
  },
}));
