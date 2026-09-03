"use client";

import { auth } from "@/lib/firebase/client";
import type { Kit } from "@/lib/schemas";
import type { KitEditMetadata } from "@/lib/kits/preservation";

export type KitResponse = {
  id: string;
  originalKit: Kit;
  currentKit: Kit;
  metadata: KitEditMetadata;
  createdAt: string;
  updatedAt: string;
};

export type KitListItem = {
  id: string;
  role: string;
  company: string;
  companyUrl: string;
  days: number;
  createdAt: string;
  updatedAt: string;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!auth) {
    throw new Error("Firebase client environment variables are not configured.");
  }

  const user = auth.currentUser;

  if (!user) {
    throw new Error("You must be logged in.");
  }

  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
