import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { User, LeaderboardEntry } from "../types";
import { getKarmaTier } from "./karma";

export const createUserProfile = async (
  firebaseUser: any,
  displayName?: string,
  photoURL?: string | null,
): Promise<User> => {
  if (!db) throw new Error("Firestore not configured");

  const userRef = doc(db, "users", firebaseUser.uid);
  const userData: User = {
    id: firebaseUser.uid,
    name:
      displayName ||
      firebaseUser.displayName ||
      firebaseUser.email?.split("@")[0] ||
      "Anonymous User",
    email: firebaseUser.email ?? null,
    photoURL: photoURL ?? firebaseUser.photoURL ?? null,
    karma: 0,
    tier: "Seedling",
    karmaStrikes: 0,
    isFrozen: false,
    freezeExpiresAt: null,
    parkingSinnerUntil: null,
    spotsShared: 0,
    spotsUsed: 0,
  };

  // Merge with existing document to avoid overwriting karma/stats if it already exists
  await setDoc(userRef, userData, { merge: true });
  return userData;
};

export const getUserProfile = async (userId: string): Promise<User | null> => {
  if (!db) return null;

  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data() as User;
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
};

export const updateUserProfile = async (
  userId: string,
  updates: Partial<User>,
): Promise<void> => {
  if (!db) return;

  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, updates);
  } catch (error) {
    console.error("Error updating user profile:", error);
  }
};

export const addKarmaToUser = async (
  userId: string,
  amount: number,
): Promise<void> => {
  if (!db) return;

  try {
    const user = await getUserProfile(userId);
    if (!user) return;

    const newKarma = user.karma + amount;
    const newTier = getKarmaTier(newKarma);

    await updateUserProfile(userId, {
      karma: newKarma,
      tier: newTier,
    });
  } catch (error) {
    console.error("Error adding karma:", error);
  }
};

export const incrementUserStats = async (
  userId: string,
  stat: "spotsShared" | "spotsUsed",
): Promise<void> => {
  if (!db) return;

  try {
    const user = await getUserProfile(userId);
    if (!user) return;

    const currentValue = user[stat] || 0;
    await updateUserProfile(userId, {
      [stat]: currentValue + 1,
    });
  } catch (error) {
    console.error("Error incrementing user stat:", error);
  }
};

export const getLeaderboard = async (
  limitCount: number = 50,
): Promise<LeaderboardEntry[]> => {
  if (!db) return [];

  try {
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("karma", ">", 0),
      orderBy("karma", "desc"),
      limit(limitCount),
    );
    const querySnapshot = await getDocs(q);

    const leaderboard: LeaderboardEntry[] = [];
    let rank = 1;

    querySnapshot.forEach((doc) => {
      const userData = doc.data() as User;
      leaderboard.push({
        userId: userData.id,
        name: userData.name,
        karma: userData.karma,
        tier: userData.tier,
        rank: rank++,
      });
    });

    return leaderboard;
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return [];
  }
};
