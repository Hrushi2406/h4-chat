import "server-only";

import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, getAdminStorage } from "@/lib/clients/firebase-admin";
import {
  ensureBillingProfile,
  getCurrentBilling,
} from "@/lib/billing/server";
import { BILLING_PLANS } from "@/lib/billing/config";
import { generateDefaultUser } from "@/lib/types/user";
import {
  serializeThreadMessageForFirestore,
  type Attachment,
  type ThreadMessage,
} from "@/lib/types/thread";
import type {
  WhatsAppAccountState,
  WhatsAppDeliveryStatus,
  WhatsAppInboundMessage,
} from "@/lib/whatsapp/types";
import {
  isRetryableMetaFailure,
} from "@/lib/whatsapp/policy";

const ACCOUNTS = "whatsappAccounts";
const INBOX = "whatsappInbox";
const OUTBOX = "whatsappOutbox";
const OUTBOX_STATUS_EVENTS = "whatsappOutboxStatusEvents";
const LINKS = "whatsappLinkIntents";
const THREADS = "threads";
const CONSENT_VERSION = "2026-08-17";
const PROCESSING_LEASE_MS = 10 * 60 * 1_000;

const db = () => {
  const instance = getAdminFirestore();
  if (!instance) throw new Error("Firestore admin is not configured");
  return instance;
};

const asDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
};

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const removeUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(removeUndefinedValues) as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Timestamp)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)]),
    ) as T;
  }
  return value;
};

export const mergeCreditUsageDocuments = (
  target: Record<string, unknown> | undefined,
  source: Record<string, unknown> | undefined,
) => {
  const entries = [
    ...(Array.isArray(target?.usage) ? target.usage : []),
    ...(Array.isArray(source?.usage) ? source.usage : []),
  ].filter((entry, index, all) => {
    const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
    return typeof id === "string" && all.findIndex(
      (candidate) => candidate && typeof candidate === "object" && (candidate as { id?: unknown }).id === id,
    ) === index;
  }) as Array<Record<string, unknown>>;
  const sum = (field: string, predicate: (entry: Record<string, unknown>) => boolean) =>
    entries.filter(predicate).reduce((total, entry) => total + Number(entry[field] ?? 0), 0);
  return {
    ...source,
    ...target,
    usage: entries,
    totalCreditsConsumed: sum("creditsConsumed", (entry) => "creditsConsumed" in entry),
    totalCreditsGranted: sum("creditsGranted", (entry) => "creditsGranted" in entry),
    totalCreditsExpired: sum("creditsExpired", (entry) => "creditsExpired" in entry),
    totalModelCostNanoUsd: sum("modelCostNanoUsd", (entry) => "creditsConsumed" in entry),
    totalToolCostNanoUsd: sum("toolCostNanoUsd", (entry) => "creditsConsumed" in entry),
    updatedAt: Timestamp.now(),
  };
};

const normalizeAccount = (
  phoneNumber: string,
  value: Record<string, unknown> | undefined,
): WhatsAppAccountState => ({
  phoneNumber,
  userId: typeof value?.userId === "string" ? value.userId : undefined,
  profileName: typeof value?.profileName === "string" ? value.profileName : undefined,
  consent:
    value?.consent === "accepted" || value?.consent === "declined"
      ? value.consent
      : "pending",
  consentVersion:
    typeof value?.consentVersion === "string" ? value.consentVersion : undefined,
  optedOut: value?.optedOut === true,
  blocked: value?.blocked === true,
  cooldownUntil: asDate(value?.cooldownUntil),
  cooldownNotifiedAt: asDate(value?.cooldownNotifiedAt),
  consentPromptedAt: asDate(value?.consentPromptedAt),
  modelId:
    typeof value?.modelId === "string"
      ? value.modelId
      : "deepseek/deepseek-v4-flash",
  activeThreadId:
    typeof value?.activeThreadId === "string" ? value.activeThreadId : undefined,
  lastInboundAt: asDate(value?.lastInboundAt),
  lastConversationAt: asDate(value?.lastConversationAt),
  serviceWindowEndsAt: asDate(value?.serviceWindowEndsAt),
  activeMessageId:
    typeof value?.activeMessageId === "string" ? value.activeMessageId : undefined,
  activeMessageClaimedAt: asDate(value?.activeMessageClaimedAt),
  pendingMessageIds: Array.isArray(value?.pendingMessageIds)
    ? value.pendingMessageIds.filter((item): item is string => typeof item === "string")
    : [],
  lastUnprocessedMessageId:
    typeof value?.lastUnprocessedMessageId === "string"
      ? value.lastUnprocessedMessageId
      : undefined,
  lastFailedOutboundId:
    typeof value?.lastFailedOutboundId === "string"
      ? value.lastFailedOutboundId
      : undefined,
  deliveryRetryOfferedFor:
    typeof value?.deliveryRetryOfferedFor === "string"
      ? value.deliveryRetryOfferedFor
      : undefined,
  requiresWebLink: value?.requiresWebLink === true,
  welcomeCreditsGranted: value?.welcomeCreditsGranted === true,
});

export interface WhatsAppClaimedWork {
  message: WhatsAppInboundMessage;
  account?: WhatsAppAccountState;
}

export interface WhatsAppInboundAcceptance {
  accepted: boolean;
  work?: WhatsAppClaimedWork;
}

export class WhatsAppStore {
  async acceptInbound(message: WhatsAppInboundMessage): Promise<WhatsAppInboundAcceptance> {
    const database = db();
    const phone = normalizePhone(message.from);
    const inboxRef = database.collection(INBOX).doc(message.id);
    const accountRef = database.collection(ACCOUNTS).doc(phone);
    const now = new Date();
    return database.runTransaction(async (transaction) => {
      const [existing, accountSnapshot] = await Promise.all([
        transaction.get(inboxRef),
        transaction.get(accountRef),
      ]);
      if (existing.exists) return { accepted: false };
      const existingAccount = accountSnapshot.data();
      const matchingUsers = existingAccount?.userId
        ? undefined
        : await database
            .collection("users")
            .where("phoneNumber", "==", phone)
            .limit(2)
            .get();
      const unambiguousUserId = matchingUsers?.size === 1
        ? matchingUsers.docs[0].id
        : undefined;
      const account = normalizeAccount(phone, existingAccount);
      const activeLeaseIsFresh = Boolean(
        account.activeMessageId &&
        account.activeMessageClaimedAt &&
        now.getTime() - account.activeMessageClaimedAt.getTime() < PROCESSING_LEASE_MS,
      );
      const queued = Boolean(
        account.activeMessageId &&
        account.activeMessageId !== message.id &&
        activeLeaseIsFresh,
      );
      const claimedAt = queued ? undefined : now;
      const pendingMessageIds = queued
        ? account.pendingMessageIds.includes(message.id)
          ? account.pendingMessageIds
          : [...account.pendingMessageIds, message.id]
        : account.pendingMessageIds.filter((id) => id !== message.id);
      transaction.create(inboxRef, removeUndefinedValues({
        ...message,
        timestamp: Timestamp.fromDate(message.timestamp),
        status: queued ? "accepted" : "processing",
        attempts: queued ? 0 : 1,
        processingStartedAt: claimedAt ? Timestamp.fromDate(claimedAt) : null,
        receivedAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      }));
      if (
        !queued &&
        account.activeMessageId &&
        account.activeMessageId !== message.id
      ) {
        transaction.set(
          database.collection(INBOX).doc(account.activeMessageId),
          {
            status: "failed",
            error: "Phone work lease expired before completion",
            completedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );
      }
      const windowStartedAt = asDate(existingAccount?.inboundWindowStartedAt);
      const insideRateWindow = Boolean(
        windowStartedAt &&
          message.timestamp.getTime() - windowStartedAt.getTime() <= 60_000,
      );
      const inboundWindowCount = insideRateWindow
        ? Number(existingAccount?.inboundWindowCount ?? 0) + 1
        : 1;
      const existingCooldownUntil = asDate(existingAccount?.cooldownUntil);
      const cooldownIsActive = Boolean(
        existingCooldownUntil && existingCooldownUntil.getTime() > now.getTime(),
      );
      const accountUpdates = {
        phoneNumber: phone,
        profileName: message.profileName ?? existingAccount?.profileName ?? null,
        lastInboundAt: Timestamp.fromDate(message.timestamp),
        serviceWindowEndsAt: Timestamp.fromMillis(message.timestamp.getTime() + 24 * 60 * 60 * 1_000),
        updatedAt: Timestamp.fromDate(now),
        inboundWindowStartedAt: insideRateWindow
          ? existingAccount?.inboundWindowStartedAt
          : Timestamp.fromDate(message.timestamp),
        inboundWindowCount,
        activeMessageId: queued ? account.activeMessageId : message.id,
        activeMessageClaimedAt: claimedAt ? Timestamp.fromDate(claimedAt) : account.activeMessageClaimedAt,
        pendingMessageIds,
        ...(inboundWindowCount > 20 && !cooldownIsActive
          ? {
              cooldownUntil: Timestamp.fromMillis(now.getTime() + 5 * 60 * 1_000),
              cooldownNotifiedAt: null,
            }
          : {}),
        ...(!accountSnapshot.exists
          ? {
              userId: unambiguousUserId ?? null,
              consent: unambiguousUserId ? "accepted" : "pending",
              consentVersion: unambiguousUserId ? CONSENT_VERSION : null,
              optedOut: false,
              blocked: false,
              modelId: "deepseek/deepseek-v4-flash",
              pendingMessageIds: [],
              welcomeCreditsGranted: Boolean(unambiguousUserId),
            }
          : {}),
      };
      transaction.set(accountRef, accountUpdates, { merge: true });
      return {
        accepted: true,
        work: {
          message: { ...message, receivedAt: now },
          ...(queued
            ? {}
            : {
                account: normalizeAccount(phone, {
                  ...existingAccount,
                  ...accountUpdates,
                }),
              }),
        },
      };
    });
  }

  async recordStatus(status: WhatsAppDeliveryStatus) {
    const database = db();
    const ref = database.collection(OUTBOX).doc(status.messageId);
    const timestamp = Timestamp.fromDate(status.timestamp);
    const eventId = `${encodeURIComponent(status.messageId)}:${status.timestamp.getTime()}:${status.status}`;
    const eventWrite = database.collection(OUTBOX_STATUS_EVENTS).doc(eventId).set(
      removeUndefinedValues({
        messageId: status.messageId,
        recipientId: normalizePhone(status.recipientId),
        status: status.status,
        timestamp,
        errors: status.errors ?? [],
        recordedAt: Timestamp.now(),
      }),
      { merge: true },
    );
    const statusField = `status${status.status[0].toUpperCase()}${status.status.slice(1)}At`;

    if (status.status !== "failed") {
      await Promise.all([
        eventWrite,
        ref.set(
          {
            recipientId: normalizePhone(status.recipientId),
            [statusField]: timestamp,
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        ),
      ]);
      return;
    }

    const snapshot = await ref.get();
    const existing = snapshot.data() ?? {};
    const retryable = isRetryableMetaFailure(status.errors);
    await Promise.all([
      eventWrite,
      ref.set(
        {
          recipientId: normalizePhone(status.recipientId),
          status: "failed",
          statusAt: timestamp,
          statusFailedAt: timestamp,
          errors: status.errors ?? [],
          retryable,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      ),
      ...(retryable && existing.retryPayload
        ? [database.collection(ACCOUNTS).doc(normalizePhone(status.recipientId)).set(
            { lastFailedOutboundId: status.messageId, updatedAt: Timestamp.now() },
            { merge: true },
          )]
        : []),
    ]);
  }

  async claimInbound(messageId: string): Promise<WhatsAppInboundMessage | undefined> {
    const database = db();
    const ref = database.collection(INBOX).doc(messageId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const data = snapshot.data() ?? {};
      const leaseAt = asDate(data.processingStartedAt);
      if (
        data.status === "completed" ||
        (data.status === "processing" &&
          leaseAt &&
          Date.now() - leaseAt.getTime() < PROCESSING_LEASE_MS)
      ) return;
      transaction.update(ref, {
        status: "processing",
        processingStartedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        attempts: Number(data.attempts ?? 0) + 1,
      });
      return {
        id: messageId,
        from: String(data.from),
        phoneNumberId: String(data.phoneNumberId),
        receivedAt: asDate(data.receivedAt),
        profileName: typeof data.profileName === "string" ? data.profileName : undefined,
        timestamp: asDate(data.timestamp) ?? new Date(),
        type: data.type,
        originalType: String(data.originalType),
        text: typeof data.text === "string" ? data.text : undefined,
        media: data.media,
        replyToMessageId:
          typeof data.replyToMessageId === "string" ? data.replyToMessageId : undefined,
      } as WhatsAppInboundMessage;
    });
  }

  async finishInbound(messageId: string, status: "completed" | "failed" | "cancelled", error?: string) {
    await db().collection(INBOX).doc(messageId).set(
      {
        status,
        error: error?.slice(0, 1_000) ?? null,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  }

  async resetInboundForRetry(messageId: string) {
    const database = db();
    const ref = database.collection(INBOX).doc(messageId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const data = snapshot.data() ?? {};
      const processingStartedAt = asDate(data.processingStartedAt);
      if (
        data.status === "accepted" ||
        (data.status === "processing" &&
          processingStartedAt &&
          Date.now() - processingStartedAt.getTime() < PROCESSING_LEASE_MS)
      ) return false;
      transaction.set(ref, {
        status: "accepted",
        error: null,
        processingStartedAt: null,
        completedAt: null,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return true;
    });
  }

  async getAccount(phoneNumber: string): Promise<WhatsAppAccountState> {
    const phone = normalizePhone(phoneNumber);
    const snapshot = await db().collection(ACCOUNTS).doc(phone).get();
    return normalizeAccount(phone, snapshot.data());
  }

  async claimPhoneWork(
    phoneNumber: string,
    messageId: string,
  ): Promise<WhatsAppAccountState | undefined> {
    const database = db();
    const ref = database.collection(ACCOUNTS).doc(normalizePhone(phoneNumber));
    const inboxRef = database.collection(INBOX).doc(messageId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const account = normalizeAccount(normalizePhone(phoneNumber), snapshot.data());
      const activeLeaseIsFresh = Boolean(
        account.activeMessageId &&
        account.activeMessageClaimedAt &&
        Date.now() - account.activeMessageClaimedAt.getTime() < PROCESSING_LEASE_MS,
      );
      if (
        account.activeMessageId &&
        account.activeMessageId !== messageId &&
        activeLeaseIsFresh
      ) {
        if (!account.pendingMessageIds.includes(messageId)) {
          transaction.set(
            ref,
            { pendingMessageIds: [...account.pendingMessageIds, messageId], updatedAt: Timestamp.now() },
            { merge: true },
          );
        }
        transaction.set(
          inboxRef,
          {
            status: "accepted",
            processingStartedAt: null,
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );
        return;
      }
      if (account.activeMessageId && account.activeMessageId !== messageId) {
        transaction.set(
          database.collection(INBOX).doc(account.activeMessageId),
          {
            status: "failed",
            error: "Phone work lease expired before completion",
            completedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          { merge: true },
        );
      }
      const claimedAt = new Date();
      const pendingMessageIds = account.pendingMessageIds.filter((id) => id !== messageId);
      transaction.set(
        ref,
        {
          activeMessageId: messageId,
          activeMessageClaimedAt: Timestamp.fromDate(claimedAt),
          pendingMessageIds,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return {
        ...account,
        activeMessageId: messageId,
        activeMessageClaimedAt: claimedAt,
        pendingMessageIds,
      };
    });
  }

  async releasePhoneWork(phoneNumber: string, messageId: string): Promise<string | undefined> {
    const database = db();
    const ref = database.collection(ACCOUNTS).doc(normalizePhone(phoneNumber));
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const account = normalizeAccount(normalizePhone(phoneNumber), snapshot.data());
      if (account.activeMessageId !== messageId) return;
      const [next, ...remaining] = account.pendingMessageIds;
      transaction.set(
        ref,
        {
          activeMessageId: next ?? null,
          activeMessageClaimedAt: next ? Timestamp.now() : null,
          pendingMessageIds: remaining,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return next;
    });
  }

  async completePhoneWork(phoneNumber: string, messageId: string): Promise<string | undefined> {
    const database = db();
    const ref = database.collection(ACCOUNTS).doc(normalizePhone(phoneNumber));
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const account = normalizeAccount(normalizePhone(phoneNumber), snapshot.data());
      if (account.activeMessageId !== messageId) return;
      const [next, ...remaining] = account.pendingMessageIds;
      transaction.set(
        ref,
        {
          activeMessageId: next ?? null,
          activeMessageClaimedAt: next ? Timestamp.now() : null,
          pendingMessageIds: remaining,
          lastUnprocessedMessageId: null,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return next;
    });
  }

  async cancelQueuedWork(
    phoneNumber: string,
    options: { releaseActive?: boolean } = {},
  ) {
    const database = db();
    const ref = database.collection(ACCOUNTS).doc(normalizePhone(phoneNumber));
    const queued = await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const account = normalizeAccount(normalizePhone(phoneNumber), snapshot.data());
      transaction.set(
        ref,
        {
          pendingMessageIds: [],
          cancellationRequestedAt: Timestamp.now(),
          ...(options.releaseActive
            ? { activeMessageId: null, activeMessageClaimedAt: null }
            : {}),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return account.pendingMessageIds;
    });
    for (let index = 0; index < queued.length; index += 400) {
      const batch = database.batch();
      for (const messageId of queued.slice(index, index + 400)) {
        batch.set(
          database.collection(INBOX).doc(messageId),
          { status: "cancelled", completedAt: Timestamp.now(), updatedAt: Timestamp.now() },
          { merge: true },
        );
      }
      await batch.commit();
    }
    return queued.length;
  }

  async isCancellationRequested(phoneNumber: string, messageId: string, activeMessageAt: Date) {
    const snapshot = await db().collection(ACCOUNTS).doc(normalizePhone(phoneNumber)).get();
    const data = snapshot.data();
    const cancellationRequestedAt = asDate(data?.cancellationRequestedAt);
    return Boolean(
      data?.optedOut === true ||
      (typeof data?.activeMessageId === "string" && data.activeMessageId !== messageId) ||
      (cancellationRequestedAt && cancellationRequestedAt.getTime() > activeMessageAt.getTime()),
    );
  }

  async updateAccount(phoneNumber: string, updates: Record<string, unknown>) {
    await db().collection(ACCOUNTS).doc(normalizePhone(phoneNumber)).set(
      { ...updates, updatedAt: Timestamp.now() },
      { merge: true },
    );
  }

  async acceptConsent(phoneNumber: string, profileName?: string): Promise<WhatsAppAccountState> {
    const phone = normalizePhone(phoneNumber);
    const existingAccount = await this.getAccount(phone);
    if (existingAccount.requiresWebLink) {
      throw new Error("This phone number must be reconnected from Sakhi Settings");
    }
    const auth = getAdminAuth();
    if (!auth) throw new Error("Firebase Auth admin is not configured");
    let authUser;
    try {
      authUser = await auth.getUserByPhoneNumber(`+${phone}`);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
      authUser = await auth.createUser({
        phoneNumber: `+${phone}`,
        displayName: profileName || "WhatsApp user",
      });
    }

    const database = db();
    const accountRef = database.collection(ACCOUNTS).doc(phone);
    const userRef = database.collection("users").doc(authUser.uid);
    await database.runTransaction(async (transaction) => {
      const [accountSnapshot, userSnapshot] = await Promise.all([
        transaction.get(accountRef),
        transaction.get(userRef),
      ]);
      const account = normalizeAccount(phone, accountSnapshot.data());
      if (account.requiresWebLink) {
        throw new Error("This phone number must be reconnected from Sakhi Settings");
      }
      if (!userSnapshot.exists) {
        transaction.create(userRef, {
          ...generateDefaultUser(authUser.uid),
          name: profileName || "",
          phoneNumber: phone,
          whatsappConnected: true,
        });
      } else {
        transaction.set(userRef, { phoneNumber: phone, whatsappConnected: true }, { merge: true });
      }
      transaction.set(
        accountRef,
        {
          userId: authUser.uid,
          profileName: profileName ?? account.profileName ?? null,
          consent: "accepted",
          consentVersion: CONSENT_VERSION,
          optedOut: false,
          requiresWebLink: false,
          consentPromptedAt: null,
          welcomeCreditsGranted: true,
          acceptedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    });
    await ensureBillingProfile(authUser.uid);
    return this.getAccount(phone);
  }

  async createThread(userId: string, phoneNumber: string, now = new Date()) {
    const id = randomUUID();
    await db().collection(THREADS).doc(id).set({
      id,
      title: `WhatsApp chat ${now.toLocaleDateString("en-IN")}`,
      titleSource: "fallback",
      messages: [],
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      userId,
      originChannel: "whatsapp",
      whatsappPhoneNumber: normalizePhone(phoneNumber),
      messageCount: 0,
      lastMessagePreview: null,
      isStarred: false,
    });
    await this.updateAccount(phoneNumber, {
      activeThreadId: id,
      lastConversationAt: now,
    });
    return id;
  }

  /**
   * Replaces the placeholder thread title with a generated one. Leaves titles the
   * user renamed by hand, or already generated, untouched.
   */
  async applyGeneratedThreadTitle(threadId: string, title: string) {
    const database = db();
    const ref = database.collection(THREADS).doc(threadId);
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      if (snapshot.data()?.titleSource !== "fallback") return;
      transaction.update(ref, { title, titleSource: "generated" });
    });
  }

  async getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
    const snapshot = await db().collection(THREADS).doc(threadId).get();
    const messages = snapshot.data()?.messages;
    return Array.isArray(messages) ? (messages as ThreadMessage[]) : [];
  }

  async getResumeTargetForThread(threadId: string, messageId?: string, userId?: string) {
    const snapshot = await db().collection(THREADS).doc(threadId).get();
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.originChannel !== "whatsapp" ||
      (userId && data.userId !== userId)
    ) return;
    const messages = Array.isArray(data.messages) ? [...data.messages].reverse() : [];
    const lastInbound = messages.find(
      (message) =>
        message?.role === "user" &&
        typeof message?.metadata?.whatsappMessageId === "string" &&
        (!messageId || message.metadata.whatsappMessageId === messageId),
    );
    if (!lastInbound) return;
    return {
      phoneNumber: String(data.whatsappPhoneNumber),
      messageId: String(lastInbound.metadata.whatsappMessageId),
    };
  }

  async appendThreadMessage(
    threadId: string,
    role: "user" | "assistant",
    content: string,
    options: {
      attachments?: Attachment[];
      metadata?: Record<string, unknown>;
      parts?: ThreadMessage["parts"];
    } = {},
  ) {
    const database = db();
    const ref = database.collection(THREADS).doc(threadId);
    const now = new Date();
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("WhatsApp Thread does not exist");
      const existing = Array.isArray(snapshot.data()?.messages)
        ? snapshot.data()?.messages
        : [];
      const whatsappMessageId = options.metadata?.whatsappMessageId;
      if (
        role === "user" &&
        typeof whatsappMessageId === "string" &&
        existing.some(
          (candidate: ThreadMessage) =>
            candidate.role === "user" &&
            (candidate.metadata as Record<string, unknown> | undefined)?.whatsappMessageId === whatsappMessageId,
        )
      ) return existing as ThreadMessage[];
      const message = serializeThreadMessageForFirestore(removeUndefinedValues({
        id: randomUUID(),
        role,
        content,
        parts: options.parts ?? [
            { type: "text", text: content },
            ...(options.attachments ?? []).map((file) => ({
              type: "file" as const,
              mediaType: file.contentType ?? "application/octet-stream",
              filename: file.name,
              url: file.url,
            })),
          ],
        createdAt: now,
        updatedAt: now.toISOString(),
        experimental_attachments: options.attachments ?? [],
        metadata: options.metadata ?? {},
        channel: "whatsapp",
      } as ThreadMessage));
      const messages = [...existing, message] as ThreadMessage[];
      transaction.update(ref, {
        messages,
        messageCount: existing.length + 1,
        lastMessagePreview: content.slice(0, 160),
        updatedAt: Timestamp.fromDate(now),
      });
      return messages;
    });
  }

  async recordOutbound(input: {
    messageId: string;
    to: string;
    threadId?: string;
    inboundMessageId?: string;
    kind: string;
    retryPayload?:
      | { type: "text"; body: string; replyToMessageId?: string }
      | { type: "buttons"; body: string; buttons: { id: string; title: string }[] }
      | { type: "link_button"; body: string; displayText: string; url: string };
  }) {
    await db().collection(OUTBOX).doc(input.messageId).set(removeUndefinedValues({
      ...input,
      acceptedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }), { merge: true });
  }

  async getRetryableOutbound(phoneNumber: string) {
    const account = await this.getAccount(phoneNumber);
    if (!account.lastFailedOutboundId) return;
    const snapshot = await db().collection(OUTBOX).doc(account.lastFailedOutboundId).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.status !== "failed" || data?.retryable !== true) return;
    const retryPayload = data.retryPayload;
    if (!retryPayload || typeof retryPayload !== "object") return;
    return {
      failedMessageId: account.lastFailedOutboundId,
      retryPayload: retryPayload as
        | { type: "text"; body: string; replyToMessageId?: string }
        | { type: "buttons"; body: string; buttons: { id: string; title: string }[] }
        | { type: "link_button"; body: string; displayText: string; url: string },
      threadId: typeof data.threadId === "string" ? data.threadId : undefined,
      inboundMessageId: typeof data.inboundMessageId === "string" ? data.inboundMessageId : undefined,
    };
  }

  async storeMedia(input: {
    userId: string;
    messageId: string;
    bytes: ArrayBuffer;
    mimeType: string;
    filename: string;
  }): Promise<Attachment> {
    const storage = getAdminStorage();
    if (!storage) throw new Error("Firebase Storage admin is not configured");
    const bucket = storage.bucket();
    const path = `users/${input.userId}/whatsapp/${input.messageId}/${input.filename}`;
    const file = bucket.file(path);
    await file.save(Buffer.from(input.bytes), {
      contentType: input.mimeType,
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0",
      },
    });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1_000,
    });
    return { id: input.messageId, name: input.filename, url, contentType: input.mimeType };
  }

  async getCredits(userId: string) {
    const billing = await getCurrentBilling(userId);
    return (
      billing.credits.paidAvailable +
      billing.credits.permanentAvailable +
      billing.credits.rechargeAvailable
    );
  }

  async getCreditSummary(userId: string) {
    const billing = await getCurrentBilling(userId);
    const available =
      billing.credits.paidAvailable +
      billing.credits.permanentAvailable +
      billing.credits.rechargeAvailable;
    const allowance = Math.max(1, BILLING_PLANS[billing.planId].monthlyCredits);
    return { available, ratio: available / allowance };
  }

  async createLinkIntent(userId: string, tokenHash: string, expiresAt: Date) {
    await db().collection(LINKS).doc(tokenHash).create({
      userId,
      status: "pending",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
    });
  }

  async getConnectionForUser(userId: string) {
    const snapshot = await db()
      .collection(ACCOUNTS)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    if (snapshot.empty) return { connected: false as const };
    const account = normalizeAccount(snapshot.docs[0].id, snapshot.docs[0].data());
    return {
      connected: true as const,
      phoneNumber: `•••• ${account.phoneNumber.slice(-4)}`,
      optedOut: account.optedOut,
      connectedAt: asDate(snapshot.docs[0].data().acceptedAt),
    };
  }

  async getAccountByUser(userId: string): Promise<WhatsAppAccountState | undefined> {
    const snapshot = await db()
      .collection(ACCOUNTS)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    if (snapshot.empty) return;
    return normalizeAccount(snapshot.docs[0].id, snapshot.docs[0].data());
  }

  async disconnectUser(userId: string) {
    const database = db();
    const snapshot = await database
      .collection(ACCOUNTS)
      .where("userId", "==", userId)
      .limit(2)
      .get();
    const batch = database.batch();
    for (const document of snapshot.docs) {
      batch.set(
        document.ref,
        {
          userId: null,
          activeThreadId: null,
          optedOut: true,
          consent: "pending",
          consentVersion: null,
          requiresWebLink: true,
          activeMessageId: null,
          activeMessageClaimedAt: null,
          pendingMessageIds: [],
          disconnectedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    }
    batch.set(
      database.collection("users").doc(userId),
      { whatsappConnected: false, phoneNumber: null, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    await batch.commit();
    const auth = getAdminAuth();
    if (auth) await auth.updateUser(userId, { phoneNumber: null });
  }

  async consumeLinkIntent(phoneNumber: string, tokenHash: string): Promise<
    | { status: "connected" | "merged"; userId: string }
    | { status: "expired" | "used" | "conflict" | "missing" }
  > {
    const database = db();
    const intentRef = database.collection(LINKS).doc(tokenHash);
    const phone = normalizePhone(phoneNumber);
    const accountRef = database.collection(ACCOUNTS).doc(phone);
    let sourceUserId: string | undefined;
    let targetUserId: string | undefined;
    let outcome: "connected" | "merged" = "connected";

    const initialIntent = await intentRef.get();
    const initialData = initialIntent.data();
    const candidateTargetId = typeof initialData?.targetUserId === "string"
      ? initialData.targetUserId
      : typeof initialData?.userId === "string"
        ? initialData.userId
        : undefined;
    if (candidateTargetId) {
      const existingMappings = await database
        .collection(ACCOUNTS)
        .where("userId", "==", candidateTargetId)
        .limit(2)
        .get();
      if (existingMappings.docs.some((document) => document.id !== phone)) {
        return { status: "conflict" };
      }
    }

    const preflight = await database.runTransaction(async (transaction) => {
      const [intentSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(intentRef),
        transaction.get(accountRef),
      ]);
      if (!intentSnapshot.exists) return { status: "missing" as const };
      const intent = intentSnapshot.data() ?? {};
      if (intent.status === "merging") {
        sourceUserId = String(intent.sourceUserId);
        targetUserId = String(intent.targetUserId);
        outcome = "merged";
        return { status: "merged" as const, userId: targetUserId };
      }
      if (intent.status !== "pending") return { status: "used" as const };
      const expiry = asDate(intent.expiresAt);
      if (!expiry || expiry.getTime() <= Date.now()) {
        transaction.update(intentRef, { status: "expired", updatedAt: Timestamp.now() });
        return { status: "expired" as const };
      }
      targetUserId = String(intent.userId);
      const account = normalizeAccount(phone, accountSnapshot.data());
      sourceUserId = account.userId;
      const targetUserRef = database.collection("users").doc(targetUserId);
      const targetUserSnapshot = await transaction.get(targetUserRef);
      const targetUser = targetUserSnapshot.data() ?? {};
      const existingTargetPhone = typeof targetUser.phoneNumber === "string"
        ? normalizePhone(targetUser.phoneNumber)
        : undefined;
      if (existingTargetPhone && existingTargetPhone !== phone) {
        return { status: "conflict" as const };
      }
      if (sourceUserId && sourceUserId !== targetUserId) {
        const sourceSnapshot = await transaction.get(database.collection("users").doc(sourceUserId));
        const source = sourceSnapshot.data() ?? {};
        const target = targetUser;
        const sourceBilling = source.billing as Record<string, unknown> | undefined;
        const sourceCredits = sourceBilling?.credits as Record<string, unknown> | undefined;
        const bothEstablished = Boolean(source.email) && Boolean(target.email);
        const sourceHasPaidPlan = sourceBilling?.planId && sourceBilling.planId !== "free";
        const targetBilling = target.billing as Record<string, unknown> | undefined;
        const targetHasPaidPlan = targetBilling?.planId && targetBilling.planId !== "free";
        if (bothEstablished || (sourceHasPaidPlan && targetHasPaidPlan)) {
          return { status: "conflict" as const };
        }
        const targetCredits = targetBilling?.credits as Record<string, unknown> | undefined;
        const preservedBilling = sourceHasPaidPlan ? sourceBilling : targetBilling;
        transaction.set(
          database.collection("users").doc(targetUserId),
          {
            memories: [...(Array.isArray(target.memories) ? target.memories : []), ...(Array.isArray(source.memories) ? source.memories : [])]
              .filter((memory, index, all) =>
                all.findIndex((candidate) => candidate?.content === memory?.content) === index,
              )
              .slice(0, 40),
            billing: {
              ...preservedBilling,
              credits: {
                ...targetCredits,
                paidAvailable: Number(targetCredits?.paidAvailable ?? 0) + Number(sourceCredits?.paidAvailable ?? 0),
                rechargeAvailable: Number(targetCredits?.rechargeAvailable ?? 0) + Number(sourceCredits?.rechargeAvailable ?? 0),
                permanentAvailable: Math.max(
                  Number(targetCredits?.permanentAvailable ?? 0),
                  Number(sourceCredits?.permanentAvailable ?? 0),
                ),
              },
            },
            phoneNumber: phone,
            whatsappConnected: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        transaction.set(
          database.collection("users").doc(sourceUserId),
          {
            mergedInto: targetUserId,
            whatsappConnected: false,
            phoneNumber: null,
            billing: {
              ...sourceBilling,
              planId: "free",
              razorpaySubscriptionId: null,
              pendingRazorpaySubscriptionId: null,
              pendingPlanId: null,
              credits: {
                ...sourceCredits,
                paidAvailable: 0,
                permanentAvailable: 0,
                rechargeAvailable: 0,
              },
              updatedAt: Timestamp.now(),
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        outcome = "merged";
      } else {
        transaction.set(
          database.collection("users").doc(targetUserId),
          { phoneNumber: phone, whatsappConnected: true, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      }
      transaction.set(
        accountRef,
        {
          userId: targetUserId,
          consent: "accepted",
          consentVersion: CONSENT_VERSION,
          optedOut: false,
          requiresWebLink: false,
          connectedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      transaction.update(intentRef, {
        status: outcome === "merged" ? "merging" : "used",
        phoneNumber: phone,
        sourceUserId: sourceUserId ?? null,
        targetUserId,
        ...(outcome === "connected" ? { usedAt: Timestamp.now() } : {}),
        updatedAt: Timestamp.now(),
      });
      return { status: outcome, userId: targetUserId } as const;
    });

    if (
      preflight.status === "merged" &&
      sourceUserId &&
      targetUserId &&
      sourceUserId !== targetUserId
    ) {
      const threads = await database.collection(THREADS).where("userId", "==", sourceUserId).get();
      for (let index = 0; index < threads.docs.length; index += 400) {
        const batch = database.batch();
        for (const document of threads.docs.slice(index, index + 400)) {
          batch.update(document.ref, { userId: targetUserId, updatedAt: Timestamp.now() });
        }
        await batch.commit();
      }
      const sourceUsage = await database
        .collection("users")
        .doc(sourceUserId)
        .collection("creditUsage")
        .get();
      for (const sourceDocument of sourceUsage.docs) {
        const targetRef = database
          .collection("users")
          .doc(targetUserId)
          .collection("creditUsage")
          .doc(sourceDocument.id);
        await database.runTransaction(async (transaction) => {
          const [sourceSnapshot, targetSnapshot] = await Promise.all([
            transaction.get(sourceDocument.ref),
            transaction.get(targetRef),
          ]);
          if (!sourceSnapshot.exists) return;
          transaction.set(
            targetRef,
            mergeCreditUsageDocuments(targetSnapshot.data(), sourceSnapshot.data()),
            { merge: true },
          );
          transaction.delete(sourceDocument.ref);
        });
      }
      const auth = getAdminAuth();
      if (auth) {
        await auth.updateUser(sourceUserId, { disabled: true, phoneNumber: null });
      }
      await database.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(intentRef);
        if (snapshot.data()?.status !== "merging") return;
        transaction.update(intentRef, {
          status: "used",
          usedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });
    }
    return preflight;
  }
}
