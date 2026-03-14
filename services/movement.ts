import { AccelerometerReading } from '../types';

// ---------------------------------------------------------------------------
// Speed verification constants — tweak these to tune behaviour
// ---------------------------------------------------------------------------
export const SPEED_THRESHOLD_KMH = 15;       // must sustain above this to confirm
export const WALKING_SPEED_KMH = 5;          // below this = "are you still leaving?"
export const STATIONARY_SPEED_KMH = 2;       // below this counts toward cancel timer
export const CONFIRMATION_DURATION_MS = 10_000; // ms sustained above threshold to broadcast
export const STATIONARY_CANCEL_MS = 20_000;  // ms stationary before cancelling entirely
export const RECONFIRM_PAUSE_MS = 15_000;    // ms to pause broadcast for re-confirmation
export const ROLLING_BUFFER_SIZE = 5;        // number of GPS readings in rolling average

export const SPEED_GATES = {
  STATIONARY_MAX: 5,      // km/h — show "Are you still in the car?"
  SUSPICIOUS_MAX: 15,     // km/h — start 20s confirmation window
  CONFIRMED_MIN: 15,      // km/h — broadcast spot to nearby drivers
  SPOOF_THRESHOLD: 100,   // km/h — GPS spoofing detection
  CLAIM_RADIUS_M: 20,     // metres — theft detection radius
};

export const TIMEOUTS = {
  MAX_MONITORING_MS: 3 * 60 * 1000,         // 3 min — must hit 15km/h or cancel
  SUSPICIOUS_WINDOW_MS: 20 * 1000,           // 20 sec — confirmation window at 5–15km/h
  CLAIM_WINDOW_MS: 10 * 60 * 1000,          // 10 min — spot expires if unclaimed
  THEFT_TRACK_MS: 5 * 60 * 1000,            // 5 min — track potential thieves
  PARKING_SINNER_MS: 24 * 60 * 60 * 1000,  // 24 hrs — sinner debuff duration
  KARMA_FREEZE_MS: 48 * 60 * 60 * 1000,    // 48 hrs — freeze duration
  STRIKE_WINDOW_MS: 7 * 24 * 60 * 60 * 1000, // 7 days — rolling strike window
  COOLDOWN_WINDOW_MS: 60 * 60 * 1000,       // 1 hr — fraud detection window
};

export const PASSIVE_AGGRESSIVE_MESSAGES = [
  "Still detecting movement... are you actually leaving or just vibing? 🤨",
  "The parking gods are watching. Move the car. 🐉",
  "GPS says you haven't moved. Bold strategy. ⏳",
  "3 minutes on the clock. The karma dragon grows impatient. 🔥",
];

/** Haversine formula — returns distance in metres */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Calculate speed in km/h between two location samples */
export function calcSpeedKmh(
  lat1: number,
  lng1: number,
  t1: number,
  lat2: number,
  lng2: number,
  t2: number,
): number {
  const distM = haversineDistance(lat1, lng1, lat2, lng2);
  const timeSec = (t2 - t1) / 1000;
  if (timeSec <= 0) return 0;
  return (distM / timeSec) * 3.6;
}

/** True if the user is moving away from the spot (current dist > previous dist) */
export function isMovingAwayFromSpot(
  spotLat: number,
  spotLng: number,
  prevLat: number,
  prevLng: number,
  currLat: number,
  currLng: number,
): boolean {
  const prevDist = haversineDistance(spotLat, spotLng, prevLat, prevLng);
  const currDist = haversineDistance(spotLat, spotLng, currLat, currLng);
  return currDist > prevDist;
}

/** Detect GPS spoofing — speed between samples exceeds plausible vehicle speed */
export function detectSpoofing(
  lat1: number,
  lng1: number,
  t1: number,
  lat2: number,
  lng2: number,
  t2: number,
): boolean {
  const speed = calcSpeedKmh(lat1, lng1, t1, lat2, lng2, t2);
  return speed > SPEED_GATES.SPOOF_THRESHOLD;
}

/** Analyse recent accelerometer readings to distinguish car vs walking */
export function analyzeAccelerometerPattern(readings: AccelerometerReading[]): {
  likelyCar: boolean;
  reason: string;
} {
  if (readings.length < 5) {
    return { likelyCar: false, reason: 'insufficient data' };
  }

  // Vertical (z-axis) variance — walking has high bounce
  const zValues = readings.map((r) => r.z);
  const zMean = zValues.reduce((a, b) => a + b, 0) / zValues.length;
  const zVariance =
    zValues.reduce((a, b) => a + (b - zMean) ** 2, 0) / zValues.length;

  // Total acceleration magnitude — car ~= 9.81 m/s² at rest, smooth when moving
  const magnitudes = readings.map((r) => Math.sqrt(r.x ** 2 + r.y ** 2 + r.z ** 2));
  const avgMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  const magVariance =
    magnitudes.reduce((a, b) => a + (b - avgMag) ** 2, 0) / magnitudes.length;

  // Walking signature: high z variance (heel-strike bounce) + erratic magnitude
  const highZBounce = zVariance > 0.5;
  const erraticMag = magVariance > 1.5;

  if (!highZBounce && !erraticMag) {
    return { likelyCar: true, reason: 'smooth acceleration — consistent with vehicle' };
  }
  if (highZBounce) {
    return { likelyCar: false, reason: 'vertical bounce detected — possible walking' };
  }
  return { likelyCar: false, reason: 'inconclusive movement pattern' };
}

/** Rolling average of a numeric buffer */
export function rollingAverage(buffer: number[]): number {
  if (buffer.length === 0) return 0;
  return buffer.reduce((a, b) => a + b, 0) / buffer.length;
}

/** Human-readable speed gate label */
export function speedGateLabel(speedKmh: number): string {
  if (speedKmh < SPEED_GATES.STATIONARY_MAX) return 'stationary';
  if (speedKmh < SPEED_GATES.SUSPICIOUS_MAX) return 'suspicious';
  return 'confirmed';
}
