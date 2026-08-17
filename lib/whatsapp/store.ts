import "server-only";

import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, getAdminStorage } from "@/lib/clients/firebase-admin";
import { ensureBillingProfile, getCurrentBilling } from "@/lib/billing/server";
import { BILLING_PLANS } from "@/lib/billing/config";
import { generateDefaultUser } from "@/lib/types/user";
import type { Attachment, ThreadMessage } from "@/lib/types/thread";
import type {
  WhatsAppAccountState,
  WhatsAppDeliveryStatus,
  WhatsAppInboundMessage,
  WhatsAppProgressEvent,
} from "@/lib/whatsapp/types";

const ACCOUNTS = "whatsappAccounts";
const INBOX = "whatsappInbox";
const OUTBOX = "whatsappOutbox";
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
  pendingMessageIds: Array.isArray(value?.pendingMessageIds)
    ? value.pendingMessageIds.filter((item): item is string => typeof item === "string")
    : [],
  lastUnprocessedMessageId:
    typeof value?.lastUnprocessedMessageId === "string"
      ? value.lastUnprocessedMessageId
      : undefined,
  welcomeCreditsGranted: value?.welcomeCreditsGranted === true,
});

export class WhatsAppStore {
  async acceptInbound(message: WhatsAppInboundMessage): Promise<boolean> {
    const database = db();
    const phone = normalizePhone(message.from);
    const inboxRef = database.collection(INBOX).doc(message.id);
    const accountRef = database.collection(ACCOUNTS).doc(phone);
    const matchingUsers = await database
      .collection("users")
      .where("phoneNumber", "==", phone)
      .limit(2)
      .get();
    const unambiguousUserId = matchingUsers.size === 1 ? matchingUsers.docs[0].id : undefined;
    const now = new Date();
    return database.runTransaction(async (transaction) => {
      const [existing, accountSnapshot] = await Promise.all([
        transaction.get(inboxRef),
        transaction.get(accountRef),
      ]);
      if (existing.exists) return false;
      transaction.create(inboxRef, removeUndefinedValues({
        ...message,
        timestamp: Timestamp.fromDate(message.timestamp),
        status: "accepted",
        attempts: 0,
        receivedAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      }));
      const existingAccount = accountSnapshot.data();
      const windowStartedAt = asDate(existingAccount?.inboundWindowStartedAt);
      const insideRateWindow = Boolean(
        windowStartedAt &&
          message.timestamp.getTime() - windowStartedAt.getTime() <= 60_000,
      );
      const inboundWindowCount = insideRateWindow
        ? Number(existingAccount?.inboundWindowCount ?? 0) + 1
        : 1;
      transaction.set(accountRef, {
        phoneNumber: phone,
        profileName: message.profileName ?? existingAccount?.profileName ?? null,
        lastInboundAt: Timestamp.fromDate(message.timestamp),
        serviceWindowEndsAt: Timestamp.fromMillis(message.timestamp.getTime() + 24 * 60 * 60 * 1_000),
        updatedAt: Timestamp.fromDate(now),
        inboundWindowStartedAt: insideRateWindow
          ? existingAccount?.inboundWindowStartedAt
          : Timestamp.fromDate(message.timestamp),
        inboundWindowCount,
        ...(inboundWindowCount > 20
          ? { cooldownUntil: Timestamp.fromMillis(now.getTime() + 5 * 60 * 1_000) }
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
      }, { merge: true });
      return true;
    });
  }

  async recordStatus(status: WhatsAppDeliveryStatus) {
    await db().collection(OUTBOX).doc(status.messageId).set(
      {
        recipientId: status.recipientId,
        status: status.status,
        statusAt: Timestamp.fromDate(status.timestamp),
        errors: status.errors ?? [],
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
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
    const ref = db().collection(INBOX).doc(messageId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return false;
    await ref.set(
      {
        status: "accepted",
        error: null,
        processingStartedAt: null,
        completedAt: null,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    return true;
  }

  async markTranscriptionCharged(messageId: string): Promise<boolean> {
    const database = db();
    const ref = database.collection(INBOX).doc(messageId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.transcriptionCharged === true) return false;
      transaction.update(ref, {
        transcriptionCharged: true,
        transcriptionChargedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return true;
    });
  }

  async getAccount(phoneNumber: string): Promise<WhatsAppAccountState> {
    const phone = normalizePhone(phoneNumber);
    const snapshot = await db().collection(ACCOUNTS).doc(phone).get();
    return normalizeAccount(phone, snapshot.data());
  }

  async claimPhoneWork(phoneNumber: string, messageId: string): Promise<boolean> {
    const database = db();
    const ref = database.collection(ACCOUNTS).doc(normalizePhone(phoneNumber));
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const account = normalizeAccount(normalizePhone(phoneNumber), snapshot.data());
      if (account.activeMessageId && account.activeMessageId !== messageId) {
        if (!account.pendingMessageIds.includes(messageId)) {
          transaction.set(
            ref,
            { pendingMessageIds: [...account.pendingMessageIds, messageId], updatedAt: Timestamp.now() },
            { merge: true },
          );
        }
        return false;
      }
      transaction.set(
        ref,
        { activeMessageId: messageId, updatedAt: Timestamp.now() },
        { merge: true },
      );
      return true;
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
          pendingMessageIds: remaining,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return next;
    });
  }

  async updateAccount(phoneNumber: string, updates: Record<string, unknown>) {
    await db().collection(ACCOUNTS).doc(normalizePhone(phoneNumber)).set(
      { ...updates, updatedAt: Timestamp.now() },
      { merge: true },
    );
  }

  async acceptConsent(phoneNumber: string, profileName?: string): Promise<WhatsAppAccountState> {
    const phone = normalizePhone(phoneNumber);
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

  async createThread(userId: string, phoneNumber: string) {
    const id = randomUUID();
    const now = new Date();
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
    await this.updateAccount(phoneNumber, { activeThreadId: id });
    return id;
  }

  async getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
    const snapshot = await db().collection(THREADS).doc(threadId).get();
    const messages = snapshot.data()?.messages;
    return Array.isArray(messages) ? (messages as ThreadMessage[]) : [];
  }

  async appendThreadMessage(
    threadId: string,
    role: "user" | "assistant",
    content: string,
    options: { attachments?: Attachment[]; metadata?: Record<string, unknown> } = {},
  ) {
    const database = db();
    const ref = database.collection(THREADS).doc(threadId);
    const now = new Date();
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("WhatsApp Thread does not exist");
      const existing = Array.isArray(snapshot.data()?.messages)
        ? snapshot.data()?.messages
        : [];
      const message = removeUndefinedValues({
        id: randomUUID(),
        role,
        content,
        parts: [
          { type: "text", text: content },
          ...(options.attachments ?? []).map((file) => ({
            type: "file",
            mediaType: file.contentType ?? "application/octet-stream",
            filename: file.name,
            url: file.url,
          })),
        ],
        createdAt: Timestamp.fromDate(now),
        updatedAt: now.toISOString(),
        experimental_attachments: options.attachments ?? [],
        metadata: options.metadata ?? {},
        channel: "whatsapp",
      });
      transaction.update(ref, {
        messages: [...existing, message],
        messageCount: existing.length + 1,
        lastMessagePreview: content.slice(0, 160),
        updatedAt: Timestamp.fromDate(now),
      });
    });
  }

  async appendProgress(threadId: string, event: WhatsAppProgressEvent) {
    if (event.kind === "accepted" || event.label.length === 0) return;
    await this.appendThreadMessage(threadId, "assistant", event.label, {
      metadata: { progress: true, progressKind: event.kind },
    });
  }

  async recordOutbound(input: {
    messageId: string;
    to: string;
    threadId?: string;
    inboundMessageId?: string;
    kind: string;
  }) {
    await db().collection(OUTBOX).doc(input.messageId).set({
      ...input,
      status: "accepted",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
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
    const downloadToken = randomUUID();
    await file.save(Buffer.from(input.bytes), {
      contentType: input.mimeType,
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
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

    const preflight = await database.runTransaction(async (transaction) => {
      const [intentSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(intentRef),
        transaction.get(accountRef),
      ]);
      if (!intentSnapshot.exists) return { status: "missing" as const };
      const intent = intentSnapshot.data() ?? {};
      if (intent.status !== "pending") return { status: "used" as const };
      const expiry = asDate(intent.expiresAt);
      if (!expiry || expiry.getTime() <= Date.now()) {
        transaction.update(intentRef, { status: "expired", updatedAt: Timestamp.now() });
        return { status: "expired" as const };
      }
      targetUserId = String(intent.userId);
      const account = normalizeAccount(phone, accountSnapshot.data());
      sourceUserId = account.userId;
      if (sourceUserId && sourceUserId !== targetUserId) {
        const [sourceSnapshot, targetSnapshot] = await Promise.all([
          transaction.get(database.collection("users").doc(sourceUserId)),
          transaction.get(database.collection("users").doc(targetUserId)),
        ]);
        const source = sourceSnapshot.data() ?? {};
        const target = targetSnapshot.data() ?? {};
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
        transaction.set(
          database.collection("users").doc(targetUserId),
          {
            memories: [...(Array.isArray(target.memories) ? target.memories : []), ...(Array.isArray(source.memories) ? source.memories : [])]
              .filter((memory, index, all) =>
                all.findIndex((candidate) => candidate?.content === memory?.content) === index,
              )
              .slice(0, 40),
            billing: {
              ...targetBilling,
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
          { mergedInto: targetUserId, whatsappConnected: false, updatedAt: new Date().toISOString() },
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
          connectedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      transaction.update(intentRef, {
        status: "used",
        phoneNumber: phone,
        usedAt: Timestamp.now(),
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
    }
    return preflight;
  }
}
