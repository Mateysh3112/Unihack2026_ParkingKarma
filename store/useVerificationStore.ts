import { create } from "zustand";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
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
  isMovingAwayFromSpot,
  detectSpoofing,
  analyzeAccelerometerPattern,
  rollingAverage,
  haversineDistance,
  DISABLE_MOVEMENT_CHECKING,
} from "../services/movement";
import {
  checkCooldownFraud,
  recordFailedVerification,
} from "../services/anticheat";
import {
  createFirestoreSpot,
  updateSpotStatus,
  subscribeToSpot,
} from "../services/spots";
import {
  AccelerometerReading,
  ClaimStatus,
  FloorSelectionResult,
  VerificationStatus,
} from "../types";

let locationSub: Location.LocationSubscription | null = null;
let accelSub: { remove: () => void } | null = null;
let monitoringTimer: ReturnType<typeof setTimeout> | null = null;
let claimTimer: ReturnType<typeof setTimeout> | null = null;
let passiveTimer: ReturnType<typeof setInterval> | null = null;
let reconfirmTimer: ReturnType<typeof setTimeout> | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
let accelReadings: AccelerometerReading[] = [];
let gpsReadingCount = 0;
let speedBuffer: number[] = [];
let suspiciousStart: number | null = null;
let stationaryStart: number | null = null;
let previousLocation: { lat: number; lng: number; ts: number } | null = null;
let passiveMessageIndex = 0;

function clearTimers() {
  if (monitoringTimer) clearTimeout(monitoringTimer);
  if (claimTimer) clearTimeout(claimTimer);
  if (passiveTimer) clearInterval(passiveTimer);
  if (reconfirmTimer) clearTimeout(reconfirmTimer);
  if (broadcastTimer) clearTimeout(broadcastTimer);
  monitoringTimer = null;
  claimTimer = null;
  passiveTimer = null;
  reconfirmTimer = null;
  broadcastTimer = null;
}

function clearSubscriptions() {
  locationSub?.remove();
  accelSub?.remove();
  locationSub = null;
  accelSub = null;
}

function resetInternals() {
  clearTimers();
  clearSubscriptions();
  accelReadings = [];
  gpsReadingCount = 0;
  speedBuffer = [];
  suspiciousStart = null;
  stationaryStart = null;
  previousLocation = null;
  passiveMessageIndex = 0;
}

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
  timeRemaining: number;
  spoofingDetected: boolean;
  accelPattern: string;
  confirmationProgress: number;
  debugRawSpeedMs: number | null;
  debugGpsAccuracy: number | null;
  debugGpsReadingCount: number;
  debugLocationPermission: string;
  isMultiStorey: boolean;
  detectedFloor: number | null;
  confirmedFloor: number | null;
  carParkId: string | null;
  carParkName: string | null;
  baselinePressure: number | null;
  currentAltitude: number | null;
  startVerification: (
    userId: string,
    lat: number,
    lng: number,
    floorData?: FloorSelectionResult,
  ) => Promise<void>;
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
  _setDebugInfo: (
    rawMs: number | null,
    accuracy: number | null,
    count: number,
  ) => void;
  setBaselinePressure: (hpa: number) => void;
  setCurrentAltitude: (m: number | null) => void;
}

export const useVerificationStore = create<VerificationStore>((set, get) => ({
  verificationStatus: "idle",
  currentSpeed: 0,
  isMovingAway: false,
  strikeCount: 0,
  isFrozen: false,
  pendingKarma: 15,
  statusMessage: "",
  passiveMessage: PASSIVE_AGGRESSIVE_MESSAGES[0],
  spotId: null,
  spotLocation: null,
  claimStatus: null,
  timeRemaining: 180,
  spoofingDetected: false,
  accelPattern: "",
  confirmationProgress: 0,
  debugRawSpeedMs: null,
  debugGpsAccuracy: null,
  debugGpsReadingCount: 0,
  debugLocationPermission: "unknown",
  isMultiStorey: false,
  detectedFloor: null,
  confirmedFloor: null,
  carParkId: null,
  carParkName: null,
  baselinePressure: null,
  currentAltitude: null,

  _setTimeRemaining: (s) => set({ timeRemaining: s }),
  _setSpeed: (kmh, movingAway) =>
    set({ currentSpeed: kmh, isMovingAway: movingAway }),
  _setPassiveMessage: (msg) => set({ passiveMessage: msg }),
  _setSpoofing: (detected) => set({ spoofingDetected: detected }),
  _setAccelPattern: (pattern) => set({ accelPattern: pattern }),
  _setConfirmationProgress: (p) => set({ confirmationProgress: p }),
  _setDebugInfo: (rawMs, accuracy, count) =>
    set({
      debugRawSpeedMs: rawMs,
      debugGpsAccuracy: accuracy,
      debugGpsReadingCount: count,
    }),
  setBaselinePressure: (hpa) => set({ baselinePressure: hpa }),
  setCurrentAltitude: (m) => set({ currentAltitude: m }),

  startVerification: async (userId, lat, lng, floorData) => {
    if (get().isFrozen) {
      set({
        verificationStatus: "cancelled",
        statusMessage:
          "Your karma is frozen. Verification is disabled for now.",
      });
      return;
    }

    const { status: locStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (locStatus !== "granted") {
      set({
        verificationStatus: "cancelled",
        statusMessage:
          "Location permission denied. Please grant location access in Settings.",
        debugLocationPermission: locStatus,
      });
      return;
    }

    if (checkCooldownFraud(userId, lat, lng)) {
      set({
        verificationStatus: "cancelled",
        statusMessage:
          "Repeated tags at the same spot were blocked for anti-cheat.",
      });
      return;
    }

    resetInternals();
    set({
      verificationStatus: "monitoring",
      spotLocation: { lat, lng },
      spotId: null,
      currentSpeed: 0,
      isMovingAway: false,
      claimStatus: null,
      timeRemaining: 180,
      spoofingDetected: false,
      accelPattern: "",
      confirmationProgress: 0,
      statusMessage: "Monitoring your departure...",
      passiveMessage: PASSIVE_AGGRESSIVE_MESSAGES[0],
      debugLocationPermission: locStatus,
      isMultiStorey: floorData?.isMultiStorey ?? false,
      confirmedFloor: floorData?.floor ?? null,
      carParkId: floorData?.carParkId ?? null,
      carParkName: floorData?.carParkName ?? null,
      detectedFloor: floorData?.floor ?? null,
    });

    createFirestoreSpot(userId, lat, lng, floorData)
      .then((spotId) => {
        set({ spotId });
        // Subscribe to spot updates to know when it's claimed
        const unsubscribe = subscribeToSpot(spotId, (spot) => {
          if (spot && spot.status === "claimed" && spot.claimedBy) {
            get().onSpotClaimed(spot.claimedBy);
          }
        });
        // Store unsubscribe function for cleanup
        // Note: In a real app, you'd want to store this and clean it up
      })
      .catch(() => set({ spotId: `local_${Date.now()}` }));

    const monitorStart = Date.now();
    monitoringTimer = setTimeout(() => {
      if (get().verificationStatus !== "broadcasted") {
        get().cancelVerification("timeout");
      }
    }, TIMEOUTS.MAX_MONITORING_MS);

    passiveTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - monitorStart) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      get()._setTimeRemaining(remaining);

      if (elapsed > 0 && elapsed % 30 === 0) {
        passiveMessageIndex =
          (passiveMessageIndex + 1) % PASSIVE_AGGRESSIVE_MESSAGES.length;
        get()._setPassiveMessage(
          PASSIVE_AGGRESSIVE_MESSAGES[passiveMessageIndex],
        );
      }
    }, 1000);

    try {
      Accelerometer.setUpdateInterval(500);
      accelSub = Accelerometer.addListener(({ x, y, z }) => {
        accelReadings.push({ x, y, z, timestamp: Date.now() });
        if (accelReadings.length > 20) accelReadings.shift();
      });
    } catch {
      accelSub = null;
    }

    try {
      locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          const state = get();
          const { spotLocation } = state;
          if (!spotLocation) return;
          if (
            state.verificationStatus !== "monitoring" &&
            state.verificationStatus !== "suspicious" &&
            state.verificationStatus !== "verified" &&
            state.verificationStatus !== "broadcasted"
          ) {
            return;
          }

          const current = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            ts: loc.timestamp,
          };

          gpsReadingCount += 1;

          if (previousLocation) {
            const spoofed = detectSpoofing(
              previousLocation.lat,
              previousLocation.lng,
              previousLocation.ts,
              current.lat,
              current.lng,
              current.ts,
            );
            if (spoofed) {
              get()._setSpoofing(true);
              get().cancelVerification("spoof");
              return;
            }
          }

          // Temporary: disable movement checking for testing
          if (DISABLE_MOVEMENT_CHECKING) {
            set({
              verificationStatus: "verified",
              statusMessage:
                "Movement checking disabled for testing. Broadcasting spot...",
              confirmationProgress: 1,
            });
            get().setBroadcasting();
            return;
          }

          const rawSpeedMs = loc.coords.speed;
          const gpsAccuracy = loc.coords.accuracy ?? null;
          if (__DEV__) {
            get()._setDebugInfo(rawSpeedMs, gpsAccuracy, gpsReadingCount);
          }

          const rawSpeedKmh =
            rawSpeedMs !== null && rawSpeedMs >= 0 ? rawSpeedMs * 3.6 : 0;

          speedBuffer.push(rawSpeedKmh);
          if (speedBuffer.length > ROLLING_BUFFER_SIZE) speedBuffer.shift();
          const averagedSpeed = rollingAverage(speedBuffer);

          const movingAway = previousLocation
            ? isMovingAwayFromSpot(
                spotLocation.lat,
                spotLocation.lng,
                previousLocation.lat,
                previousLocation.lng,
                current.lat,
                current.lng,
              )
            : false;

          const distanceFromSpot = haversineDistance(
            spotLocation.lat,
            spotLocation.lng,
            current.lat,
            current.lng,
          );

          const accelAnalysis =
            accelReadings.length >= 5
              ? analyzeAccelerometerPattern(accelReadings)
              : { likelyCar: true, reason: "collecting accelerometer data" };

          get()._setSpeed(averagedSpeed, movingAway);
          get()._setAccelPattern(accelAnalysis.reason);
          previousLocation = current;

          const now = Date.now();

          if (
            state.verificationStatus === "broadcasted" &&
            state.claimStatus === "waiting"
          ) {
            if (averagedSpeed < WALKING_SPEED_KMH && !reconfirmTimer) {
              set({ statusMessage: "You slowed down. Keep leaving the area." });
              reconfirmTimer = setTimeout(() => {
                reconfirmTimer = null;
                if (get().verificationStatus === "broadcasted") {
                  set({
                    statusMessage: "Waiting for someone to claim your spot...",
                  });
                }
              }, RECONFIRM_PAUSE_MS);
            } else if (averagedSpeed >= WALKING_SPEED_KMH && reconfirmTimer) {
              clearTimeout(reconfirmTimer);
              reconfirmTimer = null;
              set({
                statusMessage: "Waiting for someone to claim your spot...",
              });
            }
            return;
          }

          if (averagedSpeed < STATIONARY_SPEED_KMH) {
            if (stationaryStart === null) stationaryStart = now;
            const stationaryFor = stationaryStart ? now - stationaryStart : 0;
            set({
              verificationStatus: "monitoring",
              statusMessage:
                "Still stationary or walking. Start driving away to share.",
              confirmationProgress: 0,
            });
            suspiciousStart = null;

            if (stationaryFor >= STATIONARY_CANCEL_MS) {
              get().cancelVerification("no_movement");
            }
            return;
          }

          stationaryStart = null;

          if (
            averagedSpeed >= WALKING_SPEED_KMH &&
            averagedSpeed < SPEED_THRESHOLD_KMH
          ) {
            if (suspiciousStart === null) suspiciousStart = now;
            const elapsed = now - suspiciousStart;
            set({
              verificationStatus: "suspicious",
              statusMessage: `Suspicious movement detected. Reach ${SPEED_THRESHOLD_KMH} km/h within ${Math.max(0, Math.ceil((CONFIRMATION_DURATION_MS - elapsed) / 1000))}s.`,
              confirmationProgress: Math.min(
                elapsed / CONFIRMATION_DURATION_MS,
                1,
              ),
            });

            if (elapsed >= CONFIRMATION_DURATION_MS) {
              suspiciousStart = null;
              set({
                verificationStatus: "monitoring",
                statusMessage:
                  "Still too slow. Keep driving away from the spot.",
                confirmationProgress: 0,
              });
            }
            return;
          }

          suspiciousStart = null;

          if (
            !movingAway ||
            distanceFromSpot < SPEED_GATES.CLAIM_RADIUS_M + 30
          ) {
            set({
              verificationStatus: "monitoring",
              statusMessage:
                "Drive farther away from the tagged spot before it is shared.",
              confirmationProgress: 0,
            });
            return;
          }

          if (!accelAnalysis.likelyCar) {
            set({
              verificationStatus: "suspicious",
              statusMessage:
                "Walking-like motion detected. Keep driving to verify the share.",
              confirmationProgress: 0,
            });
            return;
          }

          set({
            verificationStatus: "verified",
            statusMessage:
              "Vehicle movement verified. Broadcasting your spot...",
            confirmationProgress: 1,
          });

          if (!broadcastTimer) {
            broadcastTimer = setTimeout(() => {
              broadcastTimer = null;
              if (get().verificationStatus === "verified") {
                get().setBroadcasting();
              }
            }, 300);
          }
        },
      );
    } catch {
      clearTimers();
      clearSubscriptions();
      set({
        verificationStatus: "cancelled",
        statusMessage: "Location tracking failed. Please try again.",
      });
    }
  },

  setBroadcasting: () => {
    if (get().verificationStatus !== "verified") return;

    clearTimers();
    accelSub?.remove();
    accelSub = null;

    set({
      verificationStatus: "broadcasted",
      claimStatus: "waiting",
      statusMessage: "Waiting for someone to claim your spot...",
      confirmationProgress: 1,
    });

    const { spotId } = get();
    if (spotId) {
      updateSpotStatus(spotId, "broadcasting").catch(() => {});
    }

    claimTimer = setTimeout(() => {
      if (get().claimStatus === "waiting") {
        get().onSpotExpired();
      }
    }, TIMEOUTS.CLAIM_WINDOW_MS);
  },

  cancelVerification: (reason = "manual") => {
    resetInternals();

    const { spotId } = get();
    if (spotId) {
      updateSpotStatus(spotId, "expired").catch(() => {});
    }

    let verificationStatus: VerificationStatus = "cancelled";
    let statusMessage = "Spot cancelled.";
    let strikeCount = get().strikeCount;
    let isFrozen = get().isFrozen;

    if (reason === "timeout") {
      statusMessage =
        "Share cancelled. You did not reach 15 km/h within 3 minutes.";
    } else if (reason === "no_movement") {
      statusMessage =
        "Share cancelled. You stayed in the 0-5 km/h range too long.";
    } else if (reason === "spoof") {
      verificationStatus = "spoofed";
      statusMessage =
        "Probable GPS spoofing detected from an impossible speed jump.";
    } else if (reason === "app_backgrounded") {
      statusMessage = "Verification stopped when the app left the foreground.";
    }

    if (reason !== "manual") {
      const failure = recordFailedVerification("local_user");
      strikeCount = failure.strikeCount;
      isFrozen = failure.frozen;
    }

    set({
      verificationStatus,
      claimStatus: null,
      statusMessage,
      strikeCount,
      isFrozen,
    });
  },

  onSpotClaimed: () => {
    if (claimTimer) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
    set({
      claimStatus: "claimed",
      statusMessage: "Your spot was claimed. Pending karma is now awarded.",
    });
  },

  onSpotExpired: () => {
    const { spotId } = get();
    if (spotId) {
      updateSpotStatus(spotId, "expired").catch(() => {});
    }
    set({
      claimStatus: "expired",
      statusMessage: "No one claimed your spot before it expired.",
    });
  },

  onSpotStolen: () => {
    set({
      claimStatus: "stolen",
      statusMessage: "Someone took the spot without claiming it.",
    });
  },

  resetVerification: () => {
    resetInternals();
    set({
      verificationStatus: "idle",
      currentSpeed: 0,
      isMovingAway: false,
      claimStatus: null,
      statusMessage: "",
      passiveMessage: PASSIVE_AGGRESSIVE_MESSAGES[0],
      spotId: null,
      spotLocation: null,
      timeRemaining: 180,
      spoofingDetected: false,
      accelPattern: "",
      confirmationProgress: 0,
      debugRawSpeedMs: null,
      debugGpsAccuracy: null,
      debugGpsReadingCount: 0,
      debugLocationPermission: "unknown",
      isMultiStorey: false,
      detectedFloor: null,
      confirmedFloor: null,
      carParkId: null,
      carParkName: null,
      currentAltitude: null,
    });
  },
}));
