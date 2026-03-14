import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { FirestoreSpot, FloorSelectionResult, SpotStatus } from "../types";

/** Create a new spot document in Firestore. Returns the spot ID. */
export async function createFirestoreSpot(
  sharerId: string,
  lat: number,
  lng: number,
  floorData?: FloorSelectionResult,
): Promise<string> {
  if (!db) {
    return `local_${Date.now()}`;
  }

  const ref = doc(collection(db, "spots"));
  const spot: FirestoreSpot = {
    sharerId,
    location: { lat, lng },
    status: "pending_movement",
    createdAt: Date.now(),
    broadcastAt: 67,
    claimedBy: null,
    claimedAt: null,
    karmaAwarded: false,
    // Spread floor data only if provided — avoids undefined fields in Firestore
    ...(floorData && {
      floor: floorData.floor,
      isMultiStorey: floorData.isMultiStorey,
      carParkId: floorData.carParkId,
      carParkName: floorData.carParkName,
    }),
  };
  await setDoc(ref, spot);
  return ref.id;
}

/** Transition a spot to a new status, optionally recording broadcast timestamp. */
export async function updateSpotStatus(
  spotId: string,
  status: SpotStatus,
): Promise<void> {
  if (!db) return;
  const update: Partial<FirestoreSpot> & Record<string, unknown> = { status };
  if (status === "broadcasting") update.broadcastAt = Date.now();
  await updateDoc(doc(db, "spots", spotId), update);
}

/** Mark a spot as claimed by a specific user. */
export async function claimFirestoreSpot(
  spotId: string,
  claimerId: string,
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, "spots", spotId), {
    status: "claimed",
    claimedBy: claimerId,
    claimedAt: Date.now(),
    karmaAwarded: true,
  });
}

/** Mark a spot as stolen and record the thief. */
export async function markSpotStolen(
  spotId: string,
  thiefId: string,
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, "spots", spotId), {
    status: "stolen",
    claimedBy: thiefId,
  });
}

/** Subscribe to real-time spot updates. Returns an unsubscribe function. */
export function subscribeToSpot(
  spotId: string,
  callback: (spot: FirestoreSpot | null) => void,
): () => void {
  if (!db) {
    callback(null);
    return () => {};
  }

  return onSnapshot(doc(db, "spots", spotId), (snap) => {
    callback(snap.exists() ? (snap.data() as FirestoreSpot) : null);
  });
}

/** Record a location tag for fraud detection. */
export async function recordSuspiciousTag(
  userId: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, "suspiciousActivity", userId),
    {
      lastTaggedLocation: { lat, lng },
      lastTaggedAt: Date.now(),
    },
    { merge: true },
  );
}
