export type KarmaTier = 'Seedling' | 'Balanced' | 'Enlightened' | 'Dragon';

export interface User {
  id: string;
  name: string;
  karma: number;
  tier: KarmaTier;
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
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  karma: number;
  tier: KarmaTier;
  rank: number;
}
