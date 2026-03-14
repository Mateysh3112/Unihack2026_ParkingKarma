import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const isFirebaseConfigured = hasFirebaseConfig;

export const signInUser = async () => {
  if (!auth) {
    console.warn("Firebase env vars are missing. Running without auth.");
    return null;
  }

  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!auth) {
    throw new Error("Firebase not configured");
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    return userCredential.user;
  } catch (error) {
    console.error("Sign up error:", error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!auth) {
    throw new Error("Firebase not configured");
  }

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    return userCredential.user;
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
};

export const signOutUser = async () => {
  if (!auth) {
    throw new Error("Firebase not configured");
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
};
