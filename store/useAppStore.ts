import { create } from 'zustand';
import { User, ParkingSpot, LeaderboardEntry } from '../types';
import { getKarmaTier } from '../services/karma';
import { TIMEOUTS } from '../services/movement';

interface AppState {
  user: User;
  spots: ParkingSpot[];
  leaderboard: LeaderboardEntry[];
  // Karma mutations
  addKarma: (amount: number) => void;
  removeKarma: (amount: number) => void;
  incrementSpotsShared: () => void;
  incrementSpotsUsed: () => void;
  // Debuff / freeze
  applyParkingSinner: () => void;
  applyKarmaFreeze: () => void;
  addKarmaStrike: () => void;
  clearKarmaFreeze: () => void;
  isParkingSinner: () => boolean;
  // Spots
  addSpot: (spot: ParkingSpot) => void;
  removeSpot: (spotId: string) => void;
  setLeaderboard: (entries: LeaderboardEntry[]) => void;
}

const DEFAULT_USER: User = {
  id: 'user_1',
  name: 'Parking Pilgrim',
  karma: 50,
  tier: 'Seedling',
  karmaStrikes: 0,
  isFrozen: false,
  freezeExpiresAt: null,
  parkingSinnerUntil: null,
  spotsShared: 0,
  spotsUsed: 0,
};

export const useAppStore = create<AppState>((set, get) => ({
  user: DEFAULT_USER,
  spots: [],
  leaderboard: [],

  addKarma: (amount) =>
    set((state) => {
      if (state.user.isFrozen) return state; // frozen accounts can't gain karma
      const newKarma = state.user.karma + amount;
      return {
        user: { ...state.user, karma: newKarma, tier: getKarmaTier(newKarma) },
      };
    }),

  removeKarma: (amount) =>
    set((state) => {
      const newKarma = Math.max(0, state.user.karma - amount);
      return {
        user: { ...state.user, karma: newKarma, tier: getKarmaTier(newKarma) },
      };
    }),

  incrementSpotsShared: () =>
    set((state) => ({
      user: { ...state.user, spotsShared: state.user.spotsShared + 1 },
    })),

  incrementSpotsUsed: () =>
    set((state) => ({
      user: { ...state.user, spotsUsed: state.user.spotsUsed + 1 },
    })),

  applyParkingSinner: () =>
    set((state) => ({
      user: {
        ...state.user,
        parkingSinnerUntil: Date.now() + TIMEOUTS.PARKING_SINNER_MS,
      },
    })),

  applyKarmaFreeze: () =>
    set((state) => ({
      user: {
        ...state.user,
        isFrozen: true,
        freezeExpiresAt: Date.now() + TIMEOUTS.KARMA_FREEZE_MS,
        karmaStrikes: 0, // reset after freeze applied
      },
    })),

  addKarmaStrike: () =>
    set((state) => ({
      user: { ...state.user, karmaStrikes: state.user.karmaStrikes + 1 },
    })),

  clearKarmaFreeze: () =>
    set((state) => ({
      user: { ...state.user, isFrozen: false, freezeExpiresAt: null },
    })),

  isParkingSinner: () => {
    const { parkingSinnerUntil } = get().user;
    return parkingSinnerUntil !== null && Date.now() < parkingSinnerUntil;
  },

  addSpot: (spot) => set((state) => ({ spots: [...state.spots, spot] })),

  removeSpot: (spotId) =>
    set((state) => ({ spots: state.spots.filter((s) => s.id !== spotId) })),

  setLeaderboard: (entries) => set({ leaderboard: entries }),
}));
