import { Barometer } from 'expo-sensors';

// ---------------------------------------------------------------------------
// Constants — tweak these to tune floor detection behaviour
// ---------------------------------------------------------------------------
export const FLOOR_HEIGHT_METRES = 3.0;
export const ELEVATED_THRESHOLD_METRES = 3.0;
export const CAR_PARK_DISCOVERY_THRESHOLD = 3;  // confirmations before auto-verify
export const BOUNDING_BOX_RADIUS_METRES = 50;
export const BAROMETER_SAMPLE_COUNT = 5;        // readings to average per sample
export const BASEMENT_FLOOR_LABELS = ['B3', 'B2', 'B1'] as const;
export const ABOVE_GROUND_LABELS = ['G', '1', '2', '3', '4', '5', '6+'] as const;

// ---------------------------------------------------------------------------
// Altitude and floor calculation
// ---------------------------------------------------------------------------

/**
 * Hypsometric formula: returns relative altitude in metres.
 * Positive = above baseline (higher floor), negative = below (basement).
 * Inputs are pressure in hPa.
 */
export function computeAltitude(currentPressure: number, baselinePressure: number): number {
  return 44330 * (1 - Math.pow(currentPressure / baselinePressure, 0.1903));
}

/**
 * Map altitude in metres to a signed floor integer.
 *   0 = ground, 1 = first floor above ground, -1 = B1, -2 = B2 …
 */
export function computeFloor(altitude: number): number {
  return Math.round(altitude / FLOOR_HEIGHT_METRES);
}

/**
 * Human-readable label for a floor integer.
 * Examples: -3 → 'B3', -1 → 'B1', 0 → 'G', 1 → '1', 6 → '6+'
 */
export function floorLabel(floor: number): string {
  if (floor <= -3) return 'B3';
  if (floor === -2) return 'B2';
  if (floor === -1) return 'B1';
  if (floor === 0) return 'G';
  if (floor >= 6) return '6+';
  return String(floor);
}

/**
 * All selectable floor options from B3 through 6+, in order.
 * Each entry: { label, floor } where floor is the signed integer value.
 */
export function allFloorOptions(): Array<{ label: string; floor: number }> {
  const basements = BASEMENT_FLOOR_LABELS.map((label, i) => ({
    label,
    floor: -(BASEMENT_FLOOR_LABELS.length - i), // B3 → -3, B2 → -2, B1 → -1
  }));
  const above = ABOVE_GROUND_LABELS.map((label, i) => ({
    label,
    floor: i, // G → 0, '1' → 1, '2' → 2 …
  }));
  return [...basements, ...above];
}

// ---------------------------------------------------------------------------
// Barometer sampling
// ---------------------------------------------------------------------------

/**
 * Sample the barometer BAROMETER_SAMPLE_COUNT times at ~500ms intervals and
 * return the averaged pressure in hPa. Returns null if the barometer is
 * unavailable on this device or if sampling times out.
 */
export async function sampleBarometer(): Promise<number | null> {
  let available = false;
  try {
    available = await Barometer.isAvailableAsync();
  } catch {
    return null;
  }
  if (!available) return null;

  return new Promise<number | null>((resolve) => {
    const readings: number[] = [];
    let sub: { remove: () => void } | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      sub?.remove();
      resolve(readings.length > 0
        ? readings.reduce((a, b) => a + b, 0) / readings.length
        : null,
      );
    };

    // Timeout guard: (count + 1) intervals × 500ms + 200ms buffer
    const timeout = setTimeout(finish, (BAROMETER_SAMPLE_COUNT + 1) * 500 + 200);

    try {
      Barometer.setUpdateInterval(500);
      sub = Barometer.addListener(({ pressure }) => {
        readings.push(pressure);
        if (readings.length >= BAROMETER_SAMPLE_COUNT) {
          clearTimeout(timeout);
          finish();
        }
      });
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
}
