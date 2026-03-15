/**
 * syncParkingKnowledge.ts
 *
 * ETL script — City of Melbourne Open Data → Supabase knowledge base.
 *
 * Datasets (4 total):
 *   1. On-street Parking Bays              (PRIMARY ANCHOR — 23,864 physical bays, lat/lon, roadsegmentid)
 *   2. On-street Car Parking Meters        (spatial join — nearest bay within METER_JOIN_RADIUS_M)
 *   3. Parking Zones (Street Segments)     (key join: bay.roadsegmentid → segment_id → parkingzone)
 *   4. Sign Plates Located in Each Zone    (key join: parkingzone → restriction rules)
 *
 * Join strategy:
 *   Restrictions: bay.roadsegmentid → zones.segment_id → zones.parkingzone → sign_plates.parkingzone
 *   Meters:       bay → nearest meter within METER_JOIN_RADIUS_M (spatial)
 *   Zones:        bay.roadsegmentid → zones.segment_id (key join, stored as easy_park_zone label)
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
  BAYS:        'on-street-parking-bays',                     // 23,864 physical bay locations
  METERS:      'on-street-car-parking-meters-with-location', // payment info + location
  ZONES:       'parking-zones-linked-to-street-segments',    // EasyPark zone per segment_id
  SIGN_PLATES: 'sign-plates-located-in-each-parking-zone',   // restriction rules per zone
} as const;

const TABLE            = 'parking_bays';
const BATCH_SIZE       = 400;
const METER_JOIN_RADIUS_M = 50; // attach meter if within 50 m of bay

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawBay {
  roadsegmentid: number;
  kerbsideid?: string | null;
  roadsegmentdescription?: string;
  latitude?: number;
  longitude?: number;
  location?: { lat: number; lon: number };
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

interface RawSignPlate {
  parkingzone?: number;
  restriction_days?: string | null;
  time_restrictions_start?: string | null;
  time_restrictions_finish?: string | null;
  restriction_display?: string | null;
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
  const apiKey = process.env.MELBOURNE_API_KEY;
  const keyParam = apiKey ? `&apikey=${apiKey}` : '';
  const url = `${MELBOURNE_API}/${datasetId}/exports/json?timezone=Australia/Melbourne${keyParam}`;
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
  console.log('\n[1/4] Fetching datasets from City of Melbourne Open Data...');

  const [rawBays, rawMeters, rawZones, rawSignPlates] = await Promise.all([
    fetchAll<RawBay>(DATASET.BAYS),
    fetchAll<RawMeter>(DATASET.METERS),
    fetchAll<RawZone>(DATASET.ZONES),
    fetchAll<RawSignPlate>(DATASET.SIGN_PLATES),
  ]);

  // ── 2. Index sign plates by parking zone ─────────────────────────────────
  console.log('\n[2/4] Indexing sign plates by parking zone...');

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

  /** "HH:MM:SS" → "HH:MM" */
  function hhmmss(t?: string | null): string | null {
    if (!t) return null;
    return t.length >= 5 ? t.slice(0, 5) : null;
  }

  /** "Mon-Fri" | "Sat" | "Mon-Sat" → ["Mon","Tue",...] */
  function parseDays(restrictionDays?: string | null): string[] {
    if (!restrictionDays) return [];
    const parts = restrictionDays.trim().split('-');
    const fromIdx = DAY_NAMES.indexOf(parts[0]?.trim());
    if (fromIdx < 0) return [];
    if (parts.length === 1) return [DAY_NAMES[fromIdx]];
    const toIdx = DAY_NAMES.indexOf(parts[1]?.trim());
    if (toIdx < 0) return [DAY_NAMES[fromIdx]];
    // Walk forward (handles wrap-around e.g. Fri-Mon)
    const days: string[] = [];
    let d = fromIdx;
    while (true) {
      days.push(DAY_NAMES[d]);
      if (d === toIdx) break;
      d = (d + 1) % 7;
      if (days.length > 7) break;
    }
    return days;
  }

  /** "2P" → 120, "1P" → 60, "1/2P" → 30, "1/4P" → 15, "Loading Zone 15M" → 15, etc. */
  function parseDuration(display: string): number | null {
    const wholeP = display.match(/^(\d+)P/);
    if (wholeP) return parseInt(wholeP[1]) * 60;
    const fracP = display.match(/^(\d+)\/(\d+)P/);
    if (fracP) return Math.round((parseInt(fracP[1]) / parseInt(fracP[2])) * 60);
    const loadingM = display.match(/Loading Zone (\d+)M/i);
    if (loadingM) return parseInt(loadingM[1]);
    return null;
  }

  const signPlatesByZone = new Map<number, NormRestriction[]>();
  for (const plate of rawSignPlates) {
    if (plate.parkingzone == null || !plate.restriction_display) continue;
    const existing = signPlatesByZone.get(plate.parkingzone) ?? [];
    existing.push({
      typeDesc:             plate.restriction_display,
      description:          null,
      durationMinutes:      parseDuration(plate.restriction_display),
      startTime:            hhmmss(plate.time_restrictions_start),
      endTime:              hhmmss(plate.time_restrictions_finish),
      days:                 parseDays(plate.restriction_days),
      isDisability:         plate.restriction_display.toLowerCase().includes('dis'),
      disabilityExtMinutes: null,
      exemption:            null,
    });
    signPlatesByZone.set(plate.parkingzone, existing);
  }
  console.log(`  ${signPlatesByZone.size} zones with sign plate data (of ${rawSignPlates.length} plates)`);

  // ── 3. Build meter index and zone indexes ────────────────────────────────
  console.log('\n[3/4] Building meter index and zone indexes...');

  const metersWithCoords = rawMeters.filter(
    (m) => (m.latitude != null && m.longitude != null) || m.location,
  );

  // segment_id → { label, parkingzone }
  const zoneBySegmentId         = new Map<number, string>();
  const parkingZoneBySegmentId  = new Map<number, number>();
  for (const z of rawZones) {
    if (z.segment_id == null || z.parkingzone == null) continue;
    const label = z.onstreet ? `Zone ${z.parkingzone} (${z.onstreet})` : `Zone ${z.parkingzone}`;
    zoneBySegmentId.set(z.segment_id, label);
    parkingZoneBySegmentId.set(z.segment_id, z.parkingzone);
  }
  console.log(`  ${metersWithCoords.length} meters with coordinates`);
  console.log(`  ${parkingZoneBySegmentId.size} unique segment IDs in zone index`);

  // ── 4. Build documents ────────────────────────────────────────────────────
  console.log('\n[4/4] Building rows...');

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

    // Restrictions via zone → sign plates
    const parkingZone = bay.roadsegmentid != null
      ? parkingZoneBySegmentId.get(bay.roadsegmentid)
      : undefined;
    const restrictions: ParkingBayRow['restrictions'] =
      parkingZone != null ? (signPlatesByZone.get(parkingZone) ?? null) : null;
    const marker_id: string | null = parkingZone != null ? String(parkingZone) : null;

    // Meter via nearest spatial join
    let meter: ParkingBayRow['meter'] = null;
    let nearestMeterDist = Infinity;
    for (const m of metersWithCoords) {
      const mLat = m.latitude ?? m.location?.lat;
      const mLon = m.longitude ?? m.location?.lon;
      if (mLat == null || mLon == null) continue;
      const d = haversineMetres(lat, lon, mLat, mLon);
      if (d < nearestMeterDist) {
        nearestMeterDist = d;
        if (d <= METER_JOIN_RADIUS_M) {
          meter = {
            meterId:      m.meter_id ?? null,
            tapAndGo:     m.tapandgo === 'Yes',
            cardAccepted: m.creditcard === 'Yes',
          };
        }
      }
    }

    // Zone label
    const easy_park_zone = bay.roadsegmentid != null
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
