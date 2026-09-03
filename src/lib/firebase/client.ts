"use client";

import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseClientConfig = Object.values(firebaseConfig).every(Boolean);

export const firebaseApp = hasFirebaseClientConfig
  ? getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

export async function registerWithEmail(email: string, password: string) {
  if (!auth) {
    throw new Error("Firebase client environment variables are not configured.");
  }

  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginWithEmail(email: string, password: string) {
  if (!auth) {
    throw new Error("Firebase client environment variables are not configured.");
  }

  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  if (!auth) {
    return;
  }

  return signOut(auth);
}

export async function getIdToken(user: User): Promise<string> {
  return user.getIdToken();
}
