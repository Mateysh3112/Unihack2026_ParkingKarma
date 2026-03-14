import { create } from 'zustand';
import { User, ParkingSpot, LeaderboardEntry } from '../types';
import { getKarmaTier } from '../services/karma';

interface AppState {
  user: User;
  spots: ParkingSpot[];
  leaderboard: LeaderboardEntry[];
  addKarma: (amount: number) => void;
  removeKarma: (amount: number) => void;
  addSpot: (spot: ParkingSpot) => void;
  removeSpot: (spotId: string) => void;
  setLeaderboard: (entries: LeaderboardEntry[]) => void;
}

const DEFAULT_USER: User = {
  id: 'user_1',
  name: 'Parking Pilgrim',
  karma: 50,
  tier: 'Seedling',
  spotsShared: 0,
  spotsUsed: 0,
};

export const useAppStore = create<AppState>((set) => ({
  user: DEFAULT_USER,
  spots: [],
  leaderboard: [],

  addKarma: (amount) =>
    set((state) => {
      const newKarma = state.user.karma + amount;
      return {
        user: {
          ...state.user,
          karma: newKarma,
          tier: getKarmaTier(newKarma),
          spotsShared: state.user.spotsShared + 1,
        },
      };
    }),

  removeKarma: (amount) =>
    set((state) => {
      const newKarma = Math.max(0, state.user.karma - amount);
      return {
        user: { ...state.user, karma: newKarma, tier: getKarmaTier(newKarma) },
      };
    }),

  addSpot: (spot) => set((state) => ({ spots: [...state.spots, spot] })),

  removeSpot: (spotId) =>
    set((state) => ({ spots: state.spots.filter((s) => s.id !== spotId) })),

  setLeaderboard: (entries) => set({ leaderboard: entries }),
}));
