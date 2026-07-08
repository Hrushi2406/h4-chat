import { v4 } from "uuid";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import {
  IMemory,
  MAX_MEMORY_CONTENT_LENGTH,
  MAX_USER_MEMORIES,
} from "@/lib/types/user";

const getMemoriesFromDoc = (data: FirebaseFirestore.DocumentData | undefined): IMemory[] => {
  const memories = data?.memories;
  return Array.isArray(memories) ? (memories as IMemory[]) : [];
};

export const addUserMemory = async (userId: string, content: string) => {
  const db = getAdminFirestore();
  if (!db) return { ok: false as const, error: "Storage unavailable." };

  const userRef = db.doc(`users/${userId}`);

  const memory: IMemory = {
    id: v4(),
    content: content.slice(0, MAX_MEMORY_CONTENT_LENGTH),
    updatedAt: new Date().toISOString(),
  };

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const memories = getMemoriesFromDoc(snap.data());

    if (memories.length >= MAX_USER_MEMORIES) {
      return {
        ok: false as const,
        error: "Memory limit reached. Use update_memory to replace an existing memory instead.",
      };
    }

    tx.set(
      userRef,
      { memories: [...memories, memory], updatedAt: new Date().toISOString() },
      { merge: true },
    );

    return { ok: true as const, memory };
  });

  return result;
};

export const updateUserMemory = async (
  userId: string,
  memoryId: string,
  content: string,
) => {
  const db = getAdminFirestore();
  if (!db) return { ok: false as const, error: "Storage unavailable." };

  const userRef = db.doc(`users/${userId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const memories = getMemoriesFromDoc(snap.data());
    const existing = memories.find((memory) => memory.id === memoryId);

    if (!existing) {
      return { ok: false as const, error: "Memory not found." };
    }

    const updated: IMemory = {
      ...existing,
      content: content.slice(0, MAX_MEMORY_CONTENT_LENGTH),
      updatedAt: new Date().toISOString(),
    };
    const nextMemories = memories.map((memory) =>
      memory.id === memoryId ? updated : memory,
    );

    tx.set(userRef, { memories: nextMemories }, { merge: true });

    return { ok: true as const, memory: updated };
  });
};

export const deleteUserMemory = async (userId: string, memoryId: string) => {
  const db = getAdminFirestore();
  if (!db) return { ok: false as const, error: "Storage unavailable." };

  const userRef = db.doc(`users/${userId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const memories = getMemoriesFromDoc(snap.data());
    const nextMemories = memories.filter((memory) => memory.id !== memoryId);

    if (nextMemories.length === memories.length) {
      return { ok: false as const, error: "Memory not found." };
    }

    tx.set(userRef, { memories: nextMemories }, { merge: true });

    return { ok: true as const };
  });
};
