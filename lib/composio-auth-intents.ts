import { v4 } from "uuid";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

export type ComposioAuthIntentSource = "chat" | "apps" | "automations";

export type ComposioAuthIntent = {
  id: string;
  userId: string;
  source: ComposioAuthIntentSource;
  threadId?: string;
  toolkit?: string;
  createdAt: string;
  expiresAt: string;
};

const INTENTS_COLLECTION = "composioAuthIntents";
const INTENT_TTL_MS = 30 * 60_000;

export const createComposioAuthIntent = async ({
  userId,
  source,
  threadId,
  toolkit,
}: {
  userId: string;
  source: ComposioAuthIntentSource;
  threadId?: string;
  toolkit?: string;
}) => {
  const db = getAdminFirestore();
  if (!db) return undefined;

  const now = new Date();
  const intent: ComposioAuthIntent = {
    id: v4(),
    userId,
    source,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
  };

  if (threadId) {
    intent.threadId = threadId;
  }

  if (toolkit) {
    intent.toolkit = toolkit;
  }

  await db.collection(INTENTS_COLLECTION).doc(intent.id).set(intent);

  return intent;
};

export const consumeComposioAuthIntent = async (
  intentId: string,
): Promise<ComposioAuthIntent | undefined> => {
  const db = getAdminFirestore();
  if (!db) return undefined;

  const intentRef = db.collection(INTENTS_COLLECTION).doc(intentId);
  const snap = await intentRef.get();

  if (!snap.exists) return undefined;

  const intent = snap.data() as ComposioAuthIntent;

  await intentRef.delete().catch((error) => {
    console.error(
      "Failed to delete Composio auth intent:",
      error instanceof Error ? error.message : error,
    );
  });

  if (new Date(intent.expiresAt).getTime() < Date.now()) {
    return undefined;
  }

  return intent;
};
