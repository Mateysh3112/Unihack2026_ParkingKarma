export type KarmaTier = "Seedling" | "Balanced" | "Enlightened" | "Dragon";

// ---------------------------------------------------------------------------
// Melbourne sensor types
// ---------------------------------------------------------------------------

/** A live parking bay from the City of Melbourne in-ground sensor network */
export interface ParkingBay {
  bayId: string;
  markerId: string;
  status: 'Unoccupied' | 'Occupied' | 'Unknown';
  lat: number;
  lng: number;
  lastUpdated: Date;
  source: 'melbourne_sensor';
}

// ---------------------------------------------------------------------------
// Car park types
// ---------------------------------------------------------------------------

/** A known multi-storey car park in the Firestore `carParks` collection. */
export interface CarPark {
  id: string; // Firestore document ID
  name: string;
  location: { lat: number; lng: number };
  boundingBox: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  totalFloors: number;
  floorHeight: number; // metres per floor
  isVerified: boolean;
  confirmations: string[]; // user IDs who confirmed a sighting
}

/**
 * Result from the floor selection flow.
 * floor: signed int — 0 = ground (G), positive = above ground, negative = basement
 *   (e.g. -1 = B1, -2 = B2, -3 = B3, 1 = Floor 1, 2 = Floor 2 …)
 */
export interface FloorSelectionResult {
  floor: number;
  isMultiStorey: boolean;
  carParkId: string | null;
  carParkName: string | null;
  isNewCarPark: boolean;
}

export type SpotStatus =
  | "pending_movement"
  | "broadcasting"
  | "claimed"
  | "expired"
  | "stolen";

export type VerificationStatus =
  | "idle"
  | "monitoring"
  | "suspicious"
  | "verified"
  | "broadcasted"
  | "cancelled"
  | "spoofed";

export type ClaimStatus = "waiting" | "claimed" | "expired" | "stolen" | null;

export interface User {
  id: string;
  name: string;
  email?: string | null;
  photoURL?: string | null;
  karma: number;
  tier: KarmaTier;
  karmaStrikes: number;
  isFrozen: boolean;
  freezeExpiresAt: number | null; // ms timestamp
  parkingSinnerUntil: number | null; // ms timestamp
  spotsShared: number;
  spotsUsed: number;
}

export interface ParkingSpot {
  id: string;
  latitude: number;
  longitude: number;
  reportedBy: string;
  reportedAt: Date;
  active: boolean;
  expiresAt: Date;
  status?: SpotStatus;
  claimedBy?: string | null;
  // Multi-storey fields
  floor?: number;
  isMultiStorey?: boolean;
  carParkName?: string | null;
}

export interface FirestoreSpot {
  sharerId: string;
  location: { lat: number; lng: number };
  status: SpotStatus;
  createdAt: number;
  broadcastAt: number | null;
  claimedBy: string | null;
  claimedAt: number | null;
  karmaAwarded: boolean;
  // Multi-storey fields (optional — absent on legacy spots)
  floor?: number;
  isMultiStorey?: boolean;
  carParkId?: string | null;
  carParkName?: string | null;
}

export interface SuspiciousActivity {
  lastTaggedLocation: { lat: number; lng: number };
  tagCount: number;
  lastTaggedAt: number;
  stealCount: number;
}

export interface AccelerometerReading {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  karma: number;
  tier: KarmaTier;
  rank: number;
}
