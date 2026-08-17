import "server-only";

import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

const COLLECTION = "whatsappPendingActions";
const APPROVAL_TTL_MS = 15 * 60 * 1_000;

const db = () => {
  const instance = getAdminFirestore();
  if (!instance) throw new Error("Firestore admin is not configured");
  return instance;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
};

const actionHash = (toolName: string, args: unknown) =>
  createHash("sha256")
    .update(JSON.stringify({ toolName, args: stableValue(args) }))
    .digest("hex");

export const isConsequentialWhatsAppTool = (toolName: string) => {
  const name = toolName.toLowerCase();
  if (
    [
      "use_helper",
      "composio_manage_connections",
      "save_memory",
      "update_memory",
      "delete_memory",
      "create_prompt_share_link",
    ].includes(name)
  ) return false;
  const tokens = new Set(name.split(/[^a-z0-9]+/));
  if (
    ["mark", "create", "update", "delete", "send", "write", "add", "remove", "publish", "post", "upload", "move", "copy", "schedule", "cancel", "execute", "run", "trigger", "reply", "forward", "archive", "trash", "star", "label", "invite", "share", "manage", "connect", "disconnect", "set"]
      .some((token) => tokens.has(token))
  ) return true;
  if (
    ["get", "list", "search", "read", "find", "fetch", "lookup", "inspect", "analyze", "query", "describe", "retrieve", "schema"]
      .some((token) => tokens.has(token))
  ) return false;
  return true;
};

export class WhatsAppToolApprovalStore {
  async getPending(userId: string, threadId: string) {
    const snapshot = await db().collection(COLLECTION).doc(threadId).get();
    const data = snapshot.data();
    const expiresAt = data?.expiresAt instanceof Timestamp
      ? data.expiresAt.toDate()
      : undefined;
    if (
      !snapshot.exists ||
      data?.status !== "pending" ||
      data.userId !== userId ||
      !expiresAt ||
      expiresAt.getTime() <= Date.now()
    ) return;
    return {
      toolName: String(data.toolName),
      exactInput: stableValue(data.args),
    };
  }

  async hasPending(userId: string, threadId: string) {
    return Boolean(await this.getPending(userId, threadId));
  }

  async claimPending(userId: string, threadId: string) {
    const database = db();
    const ref = database.collection(COLLECTION).doc(threadId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      const expiresAt = data?.expiresAt instanceof Timestamp
        ? data.expiresAt.toDate()
        : undefined;
      if (
        !snapshot.exists ||
        !["pending", "awaiting_auth"].includes(String(data?.status)) ||
        data?.userId !== userId ||
        !expiresAt ||
        expiresAt.getTime() <= Date.now()
      ) return;
      transaction.update(ref, {
        status: "executing",
        executionStartedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return {
        toolName: String(data.toolName),
        exactInput: stableValue(data.args),
      };
    });
  }

  async request(input: {
    userId: string;
    threadId: string;
    toolName: string;
    args: unknown;
  }) {
    const ref = db().collection(COLLECTION).doc(input.threadId);
    const hash = actionHash(input.toolName, input.args);
    await ref.set({
      ...input,
      args: stableValue(input.args),
      hash,
      status: "pending",
      expiresAt: Timestamp.fromMillis(Date.now() + APPROVAL_TTL_MS),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return {
      requiresConfirmation: true,
      actionId: input.threadId,
      toolName: input.toolName,
      exactInput: stableValue(input.args),
      instruction:
        "Show the exact action, recipient/destination, and content above. Ask the user to tap Confirm or Cancel. Do not claim the action ran.",
    };
  }

  async consume(input: {
    userId: string;
    threadId: string;
    toolName: string;
    args: unknown;
  }): Promise<boolean> {
    const database = db();
    const ref = database.collection(COLLECTION).doc(input.threadId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      const expiresAt = data?.expiresAt instanceof Timestamp
        ? data.expiresAt.toDate()
        : undefined;
      if (
        !snapshot.exists ||
        !["pending", "awaiting_auth"].includes(String(data?.status)) ||
        data?.userId !== input.userId ||
        data?.toolName !== input.toolName ||
        data?.hash !== actionHash(input.toolName, input.args) ||
        !expiresAt ||
        expiresAt.getTime() <= Date.now()
      ) return false;
      transaction.update(ref, {
        status: "executing",
        executionStartedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return true;
    });
  }

  async finish(
    userId: string,
    threadId: string,
    status: "completed" | "awaiting_auth" | "outcome_unknown",
  ) {
    const ref = db().collection(COLLECTION).doc(threadId);
    await db().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.userId !== userId) return;
      transaction.update(ref, {
        status,
        finishedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  }

  async cancel(userId: string, threadId: string) {
    const ref = db().collection(COLLECTION).doc(threadId);
    await db().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.userId !== userId) return;
      transaction.update(ref, {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  }
}
