import { supabase } from './supabase';

export interface NearestBayInfo {
  street_name: string | null;
  restrictions: {
    typeDesc: string;
    description: string | null;
    durationMinutes: number | null;
    startTime: string | null;
    endTime: string | null;
    days: string[];
    isDisability: boolean;
  }[] | null;
  meter: {
    tapAndGo: boolean;
    cardAccepted: boolean;
  } | null;
}

/**
 * Returns the nearest parking bay row within 25 m of the given coordinates,
 * or null if none found or the query fails.
 */
export async function fetchNearestBay(
  lat: number,
  lon: number,
): Promise<NearestBayInfo | null> {
  try {
    // Bounding box of ~50 m in each direction (~0.0005°)
    const D = 0.0005;
    const { data, error } = await supabase
      .from('parking_bays')
      .select('street_name, restrictions, meter, lat, lon')
      .gte('lat', lat - D).lte('lat', lat + D)
      .gte('lon', lon - D).lte('lon', lon + D);

    console.log('[parkingBays] query', { lat, lon, D, rows: data?.length, error });

    if (error) {
      console.error('[parkingBays] error:', error);
      return null;
    }
    if (!data?.length) {
      console.log('[parkingBays] no rows found in bounding box');
      return null;
    }

    // Pick the closest row
    let nearest = data[0];
    let nearestDist = haversine(lat, lon, nearest.lat, nearest.lon);
    for (const row of data.slice(1)) {
      const d = haversine(lat, lon, row.lat, row.lon);
      if (d < nearestDist) { nearestDist = d; nearest = row; }
    }

    console.log('[parkingBays] nearest bay', { nearestDist, street_name: nearest.street_name, restrictions: nearest.restrictions, meter: nearest.meter });

    if (nearestDist > 50) {
      console.log('[parkingBays] nearest bay too far:', nearestDist);
      return null;
    }

    return {
      street_name: nearest.street_name ?? null,
      restrictions: nearest.restrictions ?? null,
      meter: nearest.meter ?? null,
    };
  } catch (e) {
    console.error('[parkingBays] exception:', e);
    return null;
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
