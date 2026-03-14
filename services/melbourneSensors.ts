import { ParkingBay } from '../types';

const URL =
  'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/on-street-parking-bay-sensors/records?limit=100';

interface MelbourneSensorRecord {
  lastupdated?: string;
  status_description?: string;
  zone_number?: number | string;
  kerbsideid?: number | string;
  location?: {
    lat?: number | string;
    lon?: number | string;
  };
}

interface MelbourneSensorResponse {
  total_count?: number;
  results?: MelbourneSensorRecord[];
}

export async function fetchMelbourneParkingBays(): Promise<ParkingBay[]> {
  try {
    const allResults: MelbourneSensorRecord[] = [];
    let offset = 0;
    let totalCount: number | null = null;

    while (true) {
      const pagedUrl = offset === 0 ? URL : `${URL}&offset=${offset}`;
      const response = await fetch(pagedUrl);
      const json: MelbourneSensorResponse = await response.json();
      const results = Array.isArray(json.results) ? json.results : [];

      allResults.push(...results);

      if (totalCount === null && typeof json.total_count === 'number') {
        totalCount = json.total_count;
      }

      if (results.length === 0) break;
      if (totalCount !== null && allResults.length >= totalCount) break;
      if (results.length < 100) break;

      offset += 100;
    }

    const bays = allResults
      .filter((bay) => bay.status_description === 'Unoccupied')
      .filter((bay) => bay.location?.lat !== undefined && bay.location?.lon !== undefined)
      .map((bay) => ({
        bayId: String(bay.kerbsideid ?? ''),
        markerId: String(bay.zone_number ?? ''),
        status: 'Unoccupied' as const,
        lat: parseFloat(String(bay.location?.lat)),
        lng: parseFloat(String(bay.location?.lon)),
        lastUpdated: new Date(bay.lastupdated ?? Date.now()),
        source: 'melbourne_sensor' as const,
      }))
      .filter((bay) => Number.isFinite(bay.lat) && Number.isFinite(bay.lng));

    console.log('Melbourne parking bays returned:', bays.length);
    return bays;
  } catch (error) {
    console.error('Failed to fetch Melbourne parking bays:', error);
    return [];
  }
}
