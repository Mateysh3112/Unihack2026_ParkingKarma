import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  serverTimestamp,
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
    broadcastAt: null,
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
  if (status === "broadcasting") update.broadcastAt = serverTimestamp();
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

/** Fetch all currently broadcasting spots. */
export async function fetchBroadcastingSpots(): Promise<FirestoreSpot[]> {
  if (!db) return [];

  try {
    const q = query(
      collection(db, "spots"),
      where("status", "==", "broadcasting"),
    );
    const snap = await getDocs(q);
    return snap.docs.map(
      (doc) =>
        ({ id: doc.id, ...doc.data() }) as FirestoreSpot & { id: string },
    );
  } catch (error) {
    console.error("Error fetching broadcasting spots:", error);
    return [];
  }
}

/** Subscribe to real-time updates of all broadcasting spots. Returns unsubscribe function. */
export function subscribeToBroadcastingSpots(
  callback: (spots: (FirestoreSpot & { id: string })[]) => void,
): () => void {
  if (!db) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, "spots"),
    where("status", "==", "broadcasting"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const spots = snap.docs.map(
        (doc) =>
          ({ id: doc.id, ...doc.data() }) as FirestoreSpot & { id: string },
      );
      callback(spots);
    },
    (error) => {
      console.error("Error subscribing to broadcasting spots:", error);
      callback([]);
    },
  );
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
