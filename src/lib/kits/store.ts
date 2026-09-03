import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { generateKit } from "@/lib/pipeline/generateKit";
import { KitSchema, type Kit } from "@/lib/schemas";
import {
  createStoredKitDocument,
  emptyEditMetadata,
  mergeRegeneratedKit,
  type KitEditMetadata,
  type StoredKitDocument,
} from "./preservation";

export type KitListItem = {
  id: string;
  role: string;
  company: string;
  companyUrl: string;
  days: number;
  createdAt: string;
  updatedAt: string;
};

type FirestoreKitData = StoredKitDocument & {
  createdAtMs?: number;
  updatedAtMs?: number;
};

export async function createKitForUser({
  userId,
  jd,
  companyUrl,
  days,
}: {
  userId: string;
  jd: string;
  companyUrl: string;
  days: number;
}): Promise<{ id: string; kit: Kit }> {
  const kit = await generateKit({ jd, company_url: companyUrl, days });
  const now = new Date();
  const doc = createStoredKitDocument({ userId, kit, now });
  const ref = await collectionForUser(userId).add({
    ...doc,
    createdAtMs: now.getTime(),
    updatedAtMs: now.getTime(),
    serverCreatedAt: FieldValue.serverTimestamp(),
    serverUpdatedAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id, kit };
}

export async function listKitsForUser(userId: string): Promise<KitListItem[]> {
  const snapshot = await collectionForUser(userId).orderBy("updatedAtMs", "desc").get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreKitData;
    const kit = KitSchema.parse(data.currentKit);

    return {
      id: doc.id,
      role: kit.role.title || kit.source.role || "Untitled role",
      company: kit.source.company,
      companyUrl: kit.source.company_url,
      days: kit.schedule.days_available,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });
}

export async function getKitForUser(
  userId: string,
  kitId: string,
): Promise<StoredKitDocument | null> {
  const snapshot = await collectionForUser(userId).doc(kitId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as FirestoreKitData;

  return {
    userId,
    originalKit: KitSchema.parse(data.originalKit),
    currentKit: KitSchema.parse(data.currentKit),
    metadata: data.metadata ?? emptyEditMetadata,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function updateKitForUser({
  userId,
  kitId,
  kit,
  metadata,
}: {
  userId: string;
  kitId: string;
  kit: Kit;
  metadata: KitEditMetadata;
}): Promise<StoredKitDocument | null> {
  const existing = await getKitForUser(userId, kitId);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const currentKit = KitSchema.parse(kit);
  const updated: StoredKitDocument = {
    ...existing,
    currentKit,
    metadata,
    updatedAt: now.toISOString(),
  };

  await collectionForUser(userId).doc(kitId).set(
    {
      currentKit,
      metadata,
      updatedAt: updated.updatedAt,
      updatedAtMs: now.getTime(),
      serverUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return updated;
}

export async function regenerateKitForUser({
  userId,
  kitId,
}: {
  userId: string;
  kitId: string;
}): Promise<StoredKitDocument | null> {
  const existing = await getKitForUser(userId, kitId);

  if (!existing) {
    return null;
  }

  const regeneratedKit = await generateKit({
    jd: existing.currentKit.role.requirements.map((requirement) => requirement.text).join("\n"),
    company_url: existing.currentKit.source.company_url,
    days: existing.currentKit.schedule.days_available,
  });
  const merged = mergeRegeneratedKit({
    currentKit: existing.currentKit,
    regeneratedKit,
    metadata: existing.metadata,
  });

  return updateKitForUser({
    userId,
    kitId,
    kit: merged.kit,
    metadata: merged.metadata,
  });
}

function collectionForUser(userId: string) {
  return getAdminDb().collection("users").doc(userId).collection("kits");
}
