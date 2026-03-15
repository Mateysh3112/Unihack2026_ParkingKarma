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
    // Bounding box of ~25 m in each direction (~0.00025°)
    const D = 0.00025;
    const { data, error } = await supabase
      .from('parking_bays')
      .select('street_name, restrictions, meter, lat, lon')
      .gte('lat', lat - D).lte('lat', lat + D)
      .gte('lon', lon - D).lte('lon', lon + D);

    if (error || !data?.length) return null;

    // Pick the closest row
    let nearest = data[0];
    let nearestDist = haversine(lat, lon, nearest.lat, nearest.lon);
    for (const row of data.slice(1)) {
      const d = haversine(lat, lon, row.lat, row.lon);
      if (d < nearestDist) { nearestDist = d; nearest = row; }
    }

    if (nearestDist > 25) return null;

    return {
      street_name: nearest.street_name ?? null,
      restrictions: nearest.restrictions ?? null,
      meter: nearest.meter ?? null,
    };
  } catch {
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
