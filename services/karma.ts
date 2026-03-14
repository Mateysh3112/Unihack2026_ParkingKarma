import { KarmaTier } from '../types';

export const KARMA_TIERS: { tier: KarmaTier; min: number; color: string; emoji: string }[] = [
  { tier: 'Seedling', min: 0, color: '#4CAF50', emoji: '🌱' },
  { tier: 'Balanced', min: 100, color: '#2196F3', emoji: '⚖️' },
  { tier: 'Enlightened', min: 300, color: '#9C27B0', emoji: '✨' },
  { tier: 'Dragon', min: 600, color: '#F44336', emoji: '🐉' },
];

export function getKarmaTier(karma: number): KarmaTier {
  for (let i = KARMA_TIERS.length - 1; i >= 0; i--) {
    if (karma >= KARMA_TIERS[i].min) return KARMA_TIERS[i].tier;
  }
  return 'Seedling';
}

export function getTierInfo(tier: KarmaTier) {
  return KARMA_TIERS.find((t) => t.tier === tier) ?? KARMA_TIERS[0];
}

export function getNextTier(karma: number) {
  return KARMA_TIERS.find((t) => t.min > karma) ?? null;
}

export const KARMA_REWARDS = {
  SHARE_SPOT: 10,
  SPOT_USED: 5,
  DAILY_CHECKIN: 2,
};
