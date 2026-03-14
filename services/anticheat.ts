import { TIMEOUTS, haversineDistance } from './movement';
import { markSpotStolen } from './spots';

// ---------------------------------------------------------------------------
// Strike / freeze tracking (in-memory; mirrors Firestore in production)
// ---------------------------------------------------------------------------

interface StrikeRecord {
  count: number;
  windowStart: number;
}

const strikeRegistry = new Map<string, StrikeRecord>();

/**
 * Record one failed verification attempt.
 * Returns the current strike count and whether the account is now frozen.
 */
export function recordFailedVerification(userId: string): {
  strikeCount: number;
  frozen: boolean;
} {
  const now = Date.now();
  const existing = strikeRegistry.get(userId);

  if (!existing || now - existing.windowStart > TIMEOUTS.STRIKE_WINDOW_MS) {
    strikeRegistry.set(userId, { count: 1, windowStart: now });
    return { strikeCount: 1, frozen: false };
  }

  existing.count += 1;
  return { strikeCount: existing.count, frozen: existing.count >= 3 };
}

/** Clear strike history for a user (e.g. after freeze expires). */
export function clearStrikes(userId: string): void {
  strikeRegistry.delete(userId);
}

// ---------------------------------------------------------------------------
// Cooldown fraud detection
// ---------------------------------------------------------------------------

interface TagRecord {
  location: { lat: number; lng: number };
  timestamps: number[];
}

const tagRegistry = new Map<string, TagRecord>();

/**
 * Check whether this user has tagged the same location too many times.
 * Returns true if flagged (>3 times within 1 hour at same coords ±30m).
 */
export function checkCooldownFraud(
  userId: string,
  lat: number,
  lng: number,
): boolean {
  const now = Date.now();
  const existing = tagRegistry.get(userId);

  if (!existing) {
    tagRegistry.set(userId, { location: { lat, lng }, timestamps: [now] });
    return false;
  }

  const distM = haversineDistance(existing.location.lat, existing.location.lng, lat, lng);
  const sameLocation = distM < 30;

  // Prune timestamps outside the 1-hour window
  const recentTimestamps = existing.timestamps.filter(
    (t) => now - t < TIMEOUTS.COOLDOWN_WINDOW_MS,
  );

  if (sameLocation) {
    recentTimestamps.push(now);
    tagRegistry.set(userId, {
      location: existing.location,
      timestamps: recentTimestamps,
    });
    return recentTimestamps.length > 3;
  }

  // New location — reset
  tagRegistry.set(userId, { location: { lat, lng }, timestamps: [now] });
  return false;
}

// ---------------------------------------------------------------------------
// Theft tracking
// ---------------------------------------------------------------------------

interface TheftTracker {
  spotId: string;
  sharerId: string;
  spotLat: number;
  spotLng: number;
  timer: ReturnType<typeof setTimeout>;
  latestLocation: { lat: number; lng: number } | null;
}

const theftTrackers = new Map<string, TheftTracker>();

/**
 * Begin tracking a user who received a spot notification but hasn't claimed.
 * After THEFT_TRACK_MS, check if they're within CLAIM_RADIUS_M of the spot.
 *
 * @param suspectId      User who received the notification
 * @param sharerId       User who shared the spot
 * @param spotId         Firestore spot document ID
 * @param spotLat/Lng    Spot coordinates
 * @param onTheft        Called if theft is confirmed — apply penalties
 */
export function startTheftTracking(
  suspectId: string,
  sharerId: string,
  spotId: string,
  spotLat: number,
  spotLng: number,
  onTheft: (thiefId: string, sharerId: string, spotId: string) => void,
): void {
  stopTheftTracking(suspectId);

  const timer = setTimeout(() => {
    const tracker = theftTrackers.get(suspectId);
    if (!tracker?.latestLocation) {
      theftTrackers.delete(suspectId);
      return;
    }

    const { lat, lng } = tracker.latestLocation;
    const distM = haversineDistance(spotLat, spotLng, lat, lng);

    if (distM <= 20) {
      onTheft(suspectId, sharerId, spotId);
      markSpotStolen(spotId, suspectId).catch(() => {});
    }

    theftTrackers.delete(suspectId);
  }, TIMEOUTS.THEFT_TRACK_MS);

  theftTrackers.set(suspectId, {
    spotId,
    sharerId,
    spotLat,
    spotLng,
    timer,
    latestLocation: null,
  });
}

/** Update the latest known location of a tracked suspect. */
export function updateSuspectLocation(
  suspectId: string,
  lat: number,
  lng: number,
): void {
  const tracker = theftTrackers.get(suspectId);
  if (tracker) {
    tracker.latestLocation = { lat, lng };
  }
}

/** Cancel theft tracking for a user (e.g. they claimed the spot). */
export function stopTheftTracking(userId: string): void {
  const tracker = theftTrackers.get(userId);
  if (tracker) {
    clearTimeout(tracker.timer);
    theftTrackers.delete(userId);
  }
}
