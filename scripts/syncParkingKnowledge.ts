/**
 * syncParkingKnowledge.ts
 *
 * ETL script — City of Melbourne Open Data → Supabase knowledge base.
 *
 * Datasets (5 total):
 *   1. On-street Parking Bays    (PRIMARY ANCHOR — 23,864 physical bays, lat/lon, roadsegmentid)
 *   2. On-street Parking Sensors (BRIDGE — lat/lon + kerbsideid, joins kerbsideid→restrictions.bayid)
 *   3. On-street Car Park Bay Restrictions  (key join via sensor bridge)
 *   4. On-street Car Parking Meters         (spatial join — nearest bay within radius)
 *   5. Parking Zones (Street Segments)      (key join: roadsegmentid → segment_id)
 *
 * Join strategy:
 *   Restrictions: bay → nearest sensor (≤ SENSOR_JOIN_RADIUS_M) → sensor.kerbsideid → restrictions.bayid
 *   Meters:       bay → nearest meter within METER_JOIN_RADIUS_M (spatial)
 *   Zones:        bay.roadsegmentid → zones.segment_id (key join)
 *
 * Run:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx npx ts-node scripts/syncParkingKnowledge.ts
 *   --dry-run          fetch + join but skip all Supabase writes
 *   --limit=N          process only first N bays (smoke test)
 *   --fresh            delete existing parking_bays rows before writing
 *
 * Requires table: parking_bays (bay_id text PK, marker_id text, lat float8, lon float8,
 *   street_name text, restrictions jsonb, meter jsonb, easy_park_zone text, last_sync_at timestamptz)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Dataset IDs — verify at data.melbourne.vic.gov.au ──────────────────────
const MELBOURNE_API = 'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets';
const DATASET = {
  BAYS:         'on-street-parking-bays',                    // 23,864 physical bay locations
  SENSORS:      'on-street-parking-bay-sensors',             // 3,309 sensor bays — bridge to restrictions
  RESTRICTIONS: 'on-street-car-park-bay-restrictions',       // restriction rules per bayid
  METERS:       'on-street-car-parking-meters-with-location',// payment info + location
  ZONES:        'parking-zones-linked-to-street-segments',   // EasyPark zone per segment_id
} as const;

const TABLE             = 'parking_bays';
const BATCH_SIZE        = 400;
const METER_JOIN_RADIUS_M  = 50;  // attach meter if within 50 m of bay
const SENSOR_JOIN_RADIUS_M = 10;  // attach sensor restrictions if within 10 m of bay

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawBay {
  roadsegmentid: number;
  kerbsideid?: string | null;
  roadsegmentdescription?: string;
  latitude?: number;
  longitude?: number;
  location?: { lat: number; lon: number };
  lastupdated?: string;
}

interface RawSensor {
  kerbsideid: number;
  location?: { lat: number; lon: number };
}

interface RawRestriction {
  bayid: number;
  deviceid?: number;
  typedesc1?: string | null;  typedesc2?: string | null;  typedesc3?: string | null;
  typedesc4?: string | null;  typedesc5?: string | null;  typedesc6?: string | null;
  duration1?: number | null;  duration2?: number | null;  duration3?: number | null;
  duration4?: number | null;  duration5?: number | null;  duration6?: number | null;
  starttime1?: string | null; starttime2?: string | null; starttime3?: string | null;
  starttime4?: string | null; starttime5?: string | null; starttime6?: string | null;
  endtime1?: string | null;   endtime2?: string | null;   endtime3?: string | null;
  endtime4?: string | null;   endtime5?: string | null;   endtime6?: string | null;
  fromday1?: number | null;   fromday2?: number | null;   fromday3?: number | null;
  fromday4?: number | null;   fromday5?: number | null;   fromday6?: number | null;
  today1?: number | null;     today2?: number | null;     today3?: number | null;
  today4?: number | null;     today5?: number | null;     today6?: number | null;
  exemption1?: string | null; exemption2?: string | null; exemption3?: string | null;
  exemption4?: string | null; exemption5?: string | null; exemption6?: string | null;
  description1?: string | null; description2?: string | null; description3?: string | null;
  description4?: string | null; description5?: string | null; description6?: string | null;
  disabilityext1?: number | null; disabilityext2?: number | null;
  disabilityext3?: number | null; disabilityext4?: number | null;
}

interface RawMeter {
  latitude?: number;
  longitude?: number;
  location?: { lat: number; lon: number };
  meter_id?: string;
  tapandgo?: string;
  creditcard?: string;
}

interface RawZone {
  parkingzone?: number;
  onstreet?: string;
  segment_id?: number;
}

// ─── Supabase row shape ───────────────────────────────────────────────────────

interface ParkingBayRow {
  bay_id: string;
  marker_id: string | null;
  lat: number;
  lon: number;
  street_name: string | null;
  restrictions: {
    typeDesc: string;
    description: string | null;
    durationMinutes: number | null;
    startTime: string | null;
    endTime: string | null;
    days: string[];
    isDisability: boolean;
    disabilityExtMinutes: number | null;
    exemption: string | null;
  }[] | null;
  meter: {
    meterId: string | null;
    tapAndGo: boolean;
    cardAccepted: boolean;
  } | null;
  easy_park_zone: string | null;
  last_sync_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── CLI flags ────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const BAY_LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const FRESH     = process.argv.includes('--fresh');

/** Fetch all records from a Melbourne Open Data dataset via the bulk export endpoint. */
async function fetchAll<T>(datasetId: string): Promise<T[]> {
  process.stdout.write(`  Fetching ${datasetId} `);
  const url = `${MELBOURNE_API}/${datasetId}/exports/json?timezone=Australia/Melbourne`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${datasetId}: ${await res.text()}`);
  const all = (await res.json()) as T[];
  console.log(` ${all.length} records`);
  return all;
}

/** Upsert rows to Supabase in batches. */
async function batchUpsert(supabase: SupabaseClient, rows: ParkingBayRow[]): Promise<void> {
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(TABLE).upsert(chunk, { onConflict: 'bay_id' });
    if (error) throw new Error(`Supabase upsert error: ${error.message}`);
    written += chunk.length;
    process.stdout.write(`\r  Writing ${TABLE}: ${written}/${rows.length}`);
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('── Parking Knowledge Sync ──────────────────────────────');
  if (DRY_RUN)             console.log('DRY RUN — Supabase writes skipped');
  if (isFinite(BAY_LIMIT)) console.log(`LIMIT   — processing first ${BAY_LIMIT} bays only`);

  let supabase: SupabaseClient | null = null;
  if (!DRY_RUN) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required');
    supabase = createClient(url, key);
  }

  // ── 1. Fetch all datasets ─────────────────────────────────────────────────
  console.log('\n[1/5] Fetching datasets from City of Melbourne Open Data...');

  const [rawBays, rawSensors, rawRestrictions, rawMeters, rawZones] = await Promise.all([
    fetchAll<RawBay>(DATASET.BAYS),
    fetchAll<RawSensor>(DATASET.SENSORS),
    fetchAll<RawRestriction>(DATASET.RESTRICTIONS),
    fetchAll<RawMeter>(DATASET.METERS),
    fetchAll<RawZone>(DATASET.ZONES),
  ]);

  // ── 2. Index restrictions by bayid (wide → normalised rows) ─────────────
  console.log('\n[2/5] Indexing restrictions by bayid...');

  const SLOTS = [1, 2, 3, 4, 5, 6] as const;
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  interface NormRestriction {
    typeDesc: string;
    description: string | null;
    durationMinutes: number | null;
    startTime: string | null;
    endTime: string | null;
    days: string[];
    isDisability: boolean;
    disabilityExtMinutes: number | null;
    exemption: string | null;
  }

  function isoToHHMM(iso?: string | null): string | null {
    if (!iso) return null;
    const match = iso.match(/T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})/);
    if (!match) {
      const simple = iso.match(/T(\d{2}:\d{2})/);
      return simple ? simple[1] : null;
    }
    const [, hh, mm, ss, sign, offH, offM] = match;
    const localSecs  = parseInt(hh) * 3600 + parseInt(mm) * 60 + parseInt(ss);
    const offsetSecs = (parseInt(offH) * 3600 + parseInt(offM) * 60) * (sign === '+' ? 1 : -1);
    const AEST_SECS  = 10 * 3600;
    const DAY_SECS   = 24 * 3600;
    const melbSecs   = ((localSecs - offsetSecs + AEST_SECS) % DAY_SECS + DAY_SECS) % DAY_SECS;
    const h = Math.floor(melbSecs / 3600);
    const m = Math.floor((melbSecs % 3600) / 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  function dayRange(from?: number | null, to?: number | null): string[] {
    if (from == null || to == null) return [];
    const days: string[] = [];
    let d = from;
    while (true) {
      days.push(DAY_NAMES[d]);
      if (d === to) break;
      d = (d + 1) % 7;
      if (days.length > 7) break;
    }
    return days;
  }

  const restrictionsByBayId    = new Map<number, NormRestriction[]>();
  const restrictionsByDeviceId = new Map<number, NormRestriction[]>();
  for (const r of rawRestrictions) {
    if (r.bayid == null) continue;
    const row = r as unknown as Record<string, unknown>;
    const slots: NormRestriction[] = [];
    for (const n of SLOTS) {
      const typeDesc = row[`typedesc${n}`] as string | null;
      if (!typeDesc) continue;
      slots.push({
        typeDesc,
        description: (row[`description${n}`] as string | null) ?? null,
        durationMinutes: (row[`duration${n}`] as number | null) ?? null,
        startTime:  isoToHHMM(row[`starttime${n}`] as string | null),
        endTime:    isoToHHMM(row[`endtime${n}`] as string | null),
        days:       dayRange(row[`fromday${n}`] as number | null, row[`today${n}`] as number | null),
        isDisability:         typeDesc.toLowerCase().includes('disab'),
        disabilityExtMinutes: (row[`disabilityext${n}`] as number | null) ?? null,
        exemption:            (row[`exemption${n}`] as string | null) ?? null,
      });
    }
    restrictionsByBayId.set(r.bayid, slots);
    if (r.deviceid != null) restrictionsByDeviceId.set(r.deviceid, slots);
  }
  console.log(`  ${restrictionsByBayId.size} restriction records indexed`);

  // ── 3. Build sensor bridge + meter/zone indexes ──────────────────────────
  console.log('\n[3/5] Building sensor bridge, meter index, and zone index...');

  interface SensorWithRestrictions {
    lat: number;
    lon: number;
    kerbsideid: number;
    restrictions: NormRestriction[];
  }
  const sensorBridge: SensorWithRestrictions[] = [];
  for (const s of rawSensors) {
    const lat = s.location?.lat;
    const lon = s.location?.lon;
    if (lat == null || lon == null) continue;
    const restrictions =
      restrictionsByBayId.get(s.kerbsideid) ??
      restrictionsByDeviceId.get(s.kerbsideid) ??
      null;
    if (restrictions !== null) {
      sensorBridge.push({ lat, lon, kerbsideid: s.kerbsideid, restrictions });
    }
  }
  console.log(`  ${sensorBridge.length} sensors with restriction data (of ${rawSensors.length} sensors)`);

  const metersWithCoords = rawMeters.filter(
    (m) => (m.latitude != null && m.longitude != null) || m.location,
  );

  const zoneBySegmentId = new Map<number, string>();
  for (const z of rawZones) {
    if (z.segment_id != null && z.parkingzone != null) {
      const label = z.onstreet ? `Zone ${z.parkingzone} (${z.onstreet})` : `Zone ${z.parkingzone}`;
      zoneBySegmentId.set(z.segment_id, label);
    }
  }
  console.log(`  ${metersWithCoords.length} meters with coordinates`);
  console.log(`  ${zoneBySegmentId.size} unique segment IDs in zone index`);

  // ── 4. Build documents ────────────────────────────────────────────────────
  console.log('\n[4/5] Building rows...');

  const restrictionsDataAvailable = sensorBridge.length > 0;
  const metersDataAvailable       = metersWithCoords.length > 0;
  const zonesDataAvailable        = zoneBySegmentId.size > 0;

  const bays = rawBays
    .filter((b) => (b.latitude != null && b.longitude != null) || b.location)
    .slice(0, isFinite(BAY_LIMIT) ? BAY_LIMIT : undefined);

  const rows: ParkingBayRow[] = [];
  const now = new Date().toISOString();

  for (const bay of bays) {
    const lat = bay.latitude ?? bay.location!.lat;
    const lon = bay.longitude ?? bay.location!.lon;
    const bayId = bay.kerbsideid
      ? String(bay.kerbsideid)
      : `${Math.round(lat * 1e6)}_${Math.round(lon * 1e6)}`;

    // Restrictions via nearest sensor
    let restrictions: ParkingBayRow['restrictions'] = null;
    let marker_id: string | null = null;
    if (restrictionsDataAvailable) {
      let nearestSensor: SensorWithRestrictions | null = null;
      let nearestDist = Infinity;
      for (const s of sensorBridge) {
        const d = haversineMetres(lat, lon, s.lat, s.lon);
        if (d < nearestDist) { nearestDist = d; nearestSensor = s; }
      }
      if (nearestSensor && nearestDist <= SENSOR_JOIN_RADIUS_M) {
        restrictions = nearestSensor.restrictions;
        marker_id    = String(nearestSensor.kerbsideid);
      }
    }

    // Meter via nearest spatial join
    let meter: ParkingBayRow['meter'] = null;
    if (metersDataAvailable) {
      let nearestMeter: (typeof metersWithCoords)[0] | null = null;
      let nearestDist = Infinity;
      for (const m of metersWithCoords) {
        const mLat = m.latitude ?? m.location?.lat;
        const mLon = m.longitude ?? m.location?.lon;
        if (mLat == null || mLon == null) continue;
        const d = haversineMetres(lat, lon, mLat, mLon);
        if (d < nearestDist) { nearestDist = d; nearestMeter = m; }
      }
      if (nearestMeter && nearestDist <= METER_JOIN_RADIUS_M) {
        meter = {
          meterId:      nearestMeter.meter_id ?? null,
          tapAndGo:     nearestMeter.tapandgo === 'Yes',
          cardAccepted: nearestMeter.creditcard === 'Yes',
        };
      }
    }

    // Zone via key join
    const easy_park_zone = (zonesDataAvailable && bay.roadsegmentid != null)
      ? (zoneBySegmentId.get(bay.roadsegmentid) ?? null)
      : null;

    const street_name = bay.roadsegmentdescription ?? null;
    rows.push({ bay_id: bayId, marker_id, lat, lon, street_name, restrictions, meter, easy_park_zone, last_sync_at: now });
  }

  // ── 5. Report ─────────────────────────────────────────────────────────────
  const total            = rows.length;
  const withRestrictions = rows.filter((r) => r.restrictions !== null).length;
  const withMeter        = rows.filter((r) => r.meter !== null).length;
  const withZone         = rows.filter((r) => r.easy_park_zone !== null).length;
  const withStreetName   = rows.filter((r) => r.street_name !== null).length;

  console.log('\n── Join coverage ───────────────────────────────────────');
  console.log(`  Bays processed : ${total}`);
  console.log(`  Street name    : ${withStreetName}/${total} (${pct(withStreetName, total)}%)`);
  console.log(`  Restrictions   : ${withRestrictions}/${total} (${pct(withRestrictions, total)}%)`);
  console.log(`  Meters         : ${withMeter}/${total} (${pct(withMeter, total)}%)`);
  console.log(`  Zones          : ${withZone}/${total} (${pct(withZone, total)}%)`);

  console.log('\n── Sample rows (first 3) ───────────────────────────────');
  rows.slice(0, 3).forEach((r) => console.log(JSON.stringify(r, null, 2)));

  if (DRY_RUN) {
    console.log('\nDry run complete — nothing written to Supabase.');
    console.log('── Done ────────────────────────────────────────────────');
    return;
  }

  // ── 6. Write to Supabase ──────────────────────────────────────────────────
  console.log('\n[5/5] Writing to Supabase...');

  if (FRESH) {
    console.log(`  Deleting existing "${TABLE}" rows...`);
    const { error } = await supabase!.from(TABLE).delete().neq('bay_id', '');
    if (error) throw new Error(`Delete failed: ${error.message}`);
    console.log('  Deleted.');
  }

  await batchUpsert(supabase!, rows);

  console.log(`\nSynced ${rows.length} bays → Supabase table "${TABLE}"`);
  console.log('── Done ────────────────────────────────────────────────');
}

function pct(n: number, total: number) {
  return total === 0 ? '0' : ((n / total) * 100).toFixed(1);
}

main().catch((err) => {
  console.error('\nSync failed:', err);
  process.exit(1);
});
