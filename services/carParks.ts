import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';
import { CarPark } from '../types';
import { BOUNDING_BOX_RADIUS_METRES, CAR_PARK_DISCOVERY_THRESHOLD, FLOOR_HEIGHT_METRES } from './barometer';

// ---------------------------------------------------------------------------
// Car park lookup
// ---------------------------------------------------------------------------

/**
 * Check if a lat/lng falls within any known car park's bounding box.
 * Queries all car parks and filters client-side (Firestore doesn't support
 * compound inequality queries across different fields without composite indexes).
 * Returns the matching CarPark with its Firestore ID, or null.
 */
export async function isInsideCarPark(
  userLat: number,
  userLng: number,
): Promise<CarPark | null> {
  try {
    const snap = await getDocs(collection(db, 'carParks'));
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const { north, south, east, west } = data.boundingBox ?? {};
      if (
        north !== undefined &&
        userLat <= north &&
        userLat >= south &&
        userLng <= east &&
        userLng >= west
      ) {
        return { id: docSnap.id, ...data } as CarPark;
      }
    }
  } catch {
    // Offline or permission error — fail open (treat as unknown location)
  }
  return null;
}

// ---------------------------------------------------------------------------
// Community car park creation
// ---------------------------------------------------------------------------

/**
 * Create a new unverified car park centred on the user's current position.
 * The bounding box is a square with BOUNDING_BOX_RADIUS_METRES on each side.
 * Returns the new Firestore document ID.
 */
export async function createUnverifiedCarPark(
  lat: number,
  lng: number,
  userId: string,
): Promise<string> {
  // Convert metres to approximate lat/lng degrees
  const latDelta = BOUNDING_BOX_RADIUS_METRES / 111_320;
  const lngDelta = BOUNDING_BOX_RADIUS_METRES / (111_320 * Math.cos((lat * Math.PI) / 180));

  const ref = doc(collection(db, 'carParks'));
  const carPark: Omit<CarPark, 'id'> = {
    name: 'Unknown Car Park',
    location: { lat, lng },
    boundingBox: {
      north: lat + latDelta,
      south: lat - latDelta,
      east: lng + lngDelta,
      west: lng - lngDelta,
    },
    totalFloors: 10,
    floorHeight: FLOOR_HEIGHT_METRES,
    isVerified: false,
    confirmations: [userId],
  };
  await setDoc(ref, carPark);
  return ref.id;
}

// ---------------------------------------------------------------------------
// Community verification
// ---------------------------------------------------------------------------

/**
 * Record a user sighting at an existing unverified car park.
 * If the total unique confirmations reach CAR_PARK_DISCOVERY_THRESHOLD,
 * the car park is automatically marked as verified.
 *
 * Returns { justVerified: true } if this sighting pushed it over the threshold.
 */
export async function confirmCarParkSighting(
  carParkId: string,
  userId: string,
  currentConfirmations: string[],
): Promise<{ justVerified: boolean }> {
  // Don't double-count the same user
  if (currentConfirmations.includes(userId)) {
    return { justVerified: false };
  }

  const updatedCount = currentConfirmations.length + 1;
  const justVerified = updatedCount >= CAR_PARK_DISCOVERY_THRESHOLD;

  const update: Record<string, unknown> = {
    confirmations: arrayUnion(userId),
  };
  if (justVerified) {
    update.isVerified = true;
  }

  await updateDoc(doc(db, 'carParks', carParkId), update);
  return { justVerified };
}
