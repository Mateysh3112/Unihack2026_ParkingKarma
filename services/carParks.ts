import { supabase } from './supabase';
import { CarPark } from '../types';
import {
  BOUNDING_BOX_RADIUS_METRES,
  CAR_PARK_DISCOVERY_THRESHOLD,
  FLOOR_HEIGHT_METRES,
} from './barometer';

function rowToCarPark(row: any): CarPark {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    boundingBox: row.bounding_box,
    totalFloors: row.total_floors,
    floorHeight: row.floor_height,
    isVerified: row.is_verified,
    confirmations: row.confirmations ?? [],
  };
}

/**
 * Check if a lat/lng falls within any known car park's bounding box.
 * Returns the matching CarPark or null.
 */
export async function isInsideCarPark(
  userLat: number,
  userLng: number,
): Promise<CarPark | null> {
  try {
    const { data, error } = await supabase.from('car_parks').select('*');
    if (error || !data) return null;

    for (const row of data) {
      const { north, south, east, west } = row.bounding_box ?? {};
      if (
        north !== undefined &&
        userLat <= north &&
        userLat >= south &&
        userLng <= east &&
        userLng >= west
      ) {
        return rowToCarPark(row);
      }
    }
  } catch {
    // fail open — treat as unknown location
  }
  return null;
}

/**
 * Create a new unverified car park centred on the user's current position.
 * Returns the new row ID.
 */
export async function createUnverifiedCarPark(
  lat: number,
  lng: number,
  userId: string,
): Promise<string> {
  const latDelta = BOUNDING_BOX_RADIUS_METRES / 111_320;
  const lngDelta =
    BOUNDING_BOX_RADIUS_METRES / (111_320 * Math.cos((lat * Math.PI) / 180));

  const { data, error } = await supabase
    .from('car_parks')
    .insert({
      name: 'Unknown Car Park',
      location: { lat, lng },
      bounding_box: {
        north: lat + latDelta,
        south: lat - latDelta,
        east: lng + lngDelta,
        west: lng - lngDelta,
      },
      total_floors: 10,
      floor_height: FLOOR_HEIGHT_METRES,
      is_verified: false,
      confirmations: [userId],
    })
    .select('id')
    .single();

  if (error || !data) return `local_carpark_${Date.now()}`;
  return data.id;
}

/**
 * Record a user sighting at an existing unverified car park.
 * Auto-verifies after CAR_PARK_DISCOVERY_THRESHOLD unique confirmations.
 */
export async function confirmCarParkSighting(
  carParkId: string,
  userId: string,
  currentConfirmations: string[],
): Promise<{ justVerified: boolean }> {
  if (currentConfirmations.includes(userId)) {
    return { justVerified: false };
  }

  const updatedConfirmations = [...currentConfirmations, userId];
  const justVerified = updatedConfirmations.length >= CAR_PARK_DISCOVERY_THRESHOLD;

  const update: Record<string, unknown> = { confirmations: updatedConfirmations };
  if (justVerified) update.is_verified = true;

  const { error } = await supabase
    .from('car_parks')
    .update(update)
    .eq('id', carParkId);

  if (error) return { justVerified: false };
  return { justVerified };
}
