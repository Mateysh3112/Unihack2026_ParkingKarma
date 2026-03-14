import { create } from "zustand";
import { User, ParkingSpot, LeaderboardEntry } from "../types";
import { getKarmaTier } from "../services/karma";
import { TIMEOUTS } from "../services/movement";
import { auth } from "../services/firebase";
import {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  addKarmaToUser,
  incrementUserStats,
  getLeaderboard,
} from "../services/user";
import { onAuthStateChanged } from "firebase/auth";

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  spots: ParkingSpot[];
  leaderboard: LeaderboardEntry[];
  // Auth methods
  initializeAuth: () => void;
  signOut: () => Promise<void>;
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
  loadLeaderboard: () => Promise<void>;
}

const DEFAULT_USER: User = {
  id: "guest",
  name: "Guest User",
  karma: 0,
  tier: "Seedling",
  karmaStrikes: 0,
  isFrozen: false,
  freezeExpiresAt: null,
  parkingSinnerUntil: null,
  spotsShared: 0,
  spotsUsed: 0,
};

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  spots: [],
  leaderboard: [],

  initializeAuth: () => {
    if (!auth) {
      set({ isLoading: false });
      return;
    }

    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        let userProfile = await getUserProfile(firebaseUser.uid);

        if (!userProfile) {
          // Create new user profile
          userProfile = await createUserProfile(firebaseUser);
        }

        set({
          user: userProfile,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // User is signed out
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    });
  },

  signOut: async () => {
    if (auth) {
      await auth.signOut();
    }
  },

  addKarma: async (amount) => {
    const { user } = get();
    if (!user || user.isFrozen) return; // frozen accounts can't gain karma

    // Update local state immediately for UI responsiveness
    const newKarma = user.karma + amount;
    const newTier = getKarmaTier(newKarma);
    set((state) => ({
      user: state.user
        ? { ...state.user, karma: newKarma, tier: newTier }
        : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await addKarmaToUser(user.id, amount);
    }
  },

  removeKarma: async (amount) => {
    const { user } = get();
    if (!user) return;

    const newKarma = Math.max(0, user.karma - amount);
    const newTier = getKarmaTier(newKarma);

    // Update local state
    set((state) => ({
      user: state.user
        ? { ...state.user, karma: newKarma, tier: newTier }
        : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await updateUserProfile(user.id, { karma: newKarma, tier: newTier });
    }
  },

  incrementSpotsShared: async () => {
    const { user } = get();
    if (!user) return;

    // Update local state
    set((state) => ({
      user: state.user
        ? { ...state.user, spotsShared: state.user.spotsShared + 1 }
        : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await incrementUserStats(user.id, "spotsShared");
    }
  },

  incrementSpotsUsed: async () => {
    const { user } = get();
    if (!user) return;

    // Update local state
    set((state) => ({
      user: state.user
        ? { ...state.user, spotsUsed: state.user.spotsUsed + 1 }
        : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await incrementUserStats(user.id, "spotsUsed");
    }
  },

  applyParkingSinner: async () => {
    const { user } = get();
    if (!user) return;

    const parkingSinnerUntil = Date.now() + TIMEOUTS.PARKING_SINNER_MS;

    // Update local state
    set((state) => ({
      user: state.user ? { ...state.user, parkingSinnerUntil } : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await updateUserProfile(user.id, { parkingSinnerUntil });
    }
  },

  applyKarmaFreeze: async () => {
    const { user } = get();
    if (!user) return;

    const freezeExpiresAt = Date.now() + TIMEOUTS.KARMA_FREEZE_MS;

    // Update local state
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            isFrozen: true,
            freezeExpiresAt,
            karmaStrikes: 0, // reset after freeze applied
          }
        : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await updateUserProfile(user.id, {
        isFrozen: true,
        freezeExpiresAt,
        karmaStrikes: 0,
      });
    }
  },

  addKarmaStrike: async () => {
    const { user } = get();
    if (!user) return;

    const newStrikes = user.karmaStrikes + 1;

    // Update local state
    set((state) => ({
      user: state.user ? { ...state.user, karmaStrikes: newStrikes } : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await updateUserProfile(user.id, { karmaStrikes: newStrikes });
    }
  },

  clearKarmaFreeze: async () => {
    const { user } = get();
    if (!user) return;

    // Update local state
    set((state) => ({
      user: state.user
        ? { ...state.user, isFrozen: false, freezeExpiresAt: null }
        : null,
    }));

    // Update Firestore
    if (user.id !== "guest") {
      await updateUserProfile(user.id, {
        isFrozen: false,
        freezeExpiresAt: null,
      });
    }
  },

  isParkingSinner: () => {
    const { user } = get();
    if (!user) return false;
    const { parkingSinnerUntil } = user;
    return parkingSinnerUntil !== null && Date.now() < parkingSinnerUntil;
  },

  addSpot: (spot) => set((state) => ({ spots: [...state.spots, spot] })),

  removeSpot: (spotId) =>
    set((state) => ({ spots: state.spots.filter((s) => s.id !== spotId) })),

  setLeaderboard: (entries) => set({ leaderboard: entries }),

  loadLeaderboard: async () => {
    const leaderboard = await getLeaderboard();
    set({ leaderboard });
  },
}));
