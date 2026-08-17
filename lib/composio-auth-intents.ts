import { v4 } from "uuid";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

export type ComposioAuthIntentSource = "chat" | "apps" | "automations";

export type ComposioAuthIntent = {
  id: string;
  userId: string;
  source: ComposioAuthIntentSource;
  threadId?: string;
  channelMessageId?: string;
  toolkit?: string;
  createdAt: string;
  expiresAt: string;
  status?: "pending" | "consumed";
};

const INTENTS_COLLECTION = "composioAuthIntents";
const INTENT_TTL_MS = 30 * 60_000;

export const createComposioAuthIntent = async ({
  userId,
  source,
  threadId,
  channelMessageId,
  toolkit,
}: {
  userId: string;
  source: ComposioAuthIntentSource;
  threadId?: string;
  channelMessageId?: string;
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
    status: "pending",
  };

  if (threadId) {
    intent.threadId = threadId;
  }

  if (channelMessageId) {
    intent.channelMessageId = channelMessageId;
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
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(intentRef);
    if (!snap.exists) return undefined;
    const intent = snap.data() as ComposioAuthIntent;
    if (intent.status && intent.status !== "pending") return undefined;
    if (new Date(intent.expiresAt).getTime() < Date.now()) {
      transaction.update(intentRef, { status: "consumed", consumedAt: new Date().toISOString() });
      return undefined;
    }
    transaction.update(intentRef, {
      status: "consumed",
      consumedAt: new Date().toISOString(),
    });
    return intent;
  });
};
