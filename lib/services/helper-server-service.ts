import { FieldValue } from "firebase-admin/firestore";
import { v4 } from "uuid";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import type { Helper, UserHelper } from "@/lib/types/helper";
import {
  MAX_HELPER_INSTRUCTIONS_LENGTH,
  MAX_HELPER_TITLE_LENGTH,
  MAX_HELPER_WHEN_TO_USE_LENGTH,
} from "@/lib/types/helper";

const HELPERS = "helpers";
const USERS = "users";
const USER_HELPERS = "helpers";

// Caps for the chat hot path: never scan the whole published collection.
// Globally-available helpers are the curated verified set; a user's own
// authored helpers are naturally few. Both are bounded so read cost stays
// flat as the catalog grows.
const MAX_GLOBAL_HELPERS = 100;
const MAX_OWNED_HELPERS = 100;

const getDb = () => {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin is not configured");
  return db;
};

const asIso = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
};

const normalizeHelper = (id: string, data: Record<string, unknown>): Helper => ({
  id,
  slug: String(data.slug ?? ""),
  title: String(data.title ?? ""),
  emoji: String(data.emoji ?? "📖"),
  appearance: data.appearance === "logo" && data.logoUrl ? "logo" : "emoji",
  logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : "",
  whenToUse: String(data.whenToUse ?? ""),
  instructions: String(data.instructions ?? ""),
  authorId: String(data.authorId ?? ""),
  authorName: String(data.authorName ?? "Sakhi member"),
  status:
    data.status === "pending_review" ||
    data.status === "published" ||
    data.status === "rejected" ||
    data.status === "removed"
      ? data.status
      : "draft",
  rejectionReason:
    typeof data.rejectionReason === "string" ? data.rejectionReason : "",
  verificationStatus:
    data.verificationStatus === "verified" ? "verified" : "unverified",
  usageCount: Number(data.usageCount) || 0,
  createdAt: asIso(data.createdAt),
  updatedAt: asIso(data.updatedAt),
});

const clean = (value: unknown, field: string, max: number) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  const result = value.trim();
  if (result.length > max) throw new Error(`${field} is too long`);
  return result;
};

const makeSlug = (title: string, id: string) => {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "helper"}-${id.slice(0, 6)}`;
};

class HelperServerService {
  async getAvailableHelpers(userId: string): Promise<Helper[]> {
    const db = getDb();

    // Only fetch what can actually be available to this user, each bounded:
    // - the curated verified+published set (global, same for everyone)
    // - the user's own authored helpers (any status)
    // - the user's added library
    // This avoids scanning the entire published collection on every message.
    const [verified, owned, library] = await Promise.all([
      db
        .collection(HELPERS)
        .where("status", "==", "published")
        .where("verificationStatus", "==", "verified")
        .limit(MAX_GLOBAL_HELPERS)
        .get(),
      db
        .collection(HELPERS)
        .where("authorId", "==", userId)
        .limit(MAX_OWNED_HELPERS)
        .get(),
      db.collection(USERS).doc(userId).collection(USER_HELPERS).get(),
    ]);

    const addedHelperIds = library.docs
      .filter((item) => item.data().autoUse !== false)
      .map((item) => item.id);
    const addedDocs = addedHelperIds.length
      ? await db.getAll(
          ...addedHelperIds.map((id) => db.collection(HELPERS).doc(id)),
        )
      : [];

    const available = new Map<string, Helper>();
    for (const snapshot of [...verified.docs, ...owned.docs, ...addedDocs]) {
      if (!snapshot.exists) continue;
      const helper = normalizeHelper(snapshot.id, snapshot.data()!);
      if (helper.status === "removed") continue;
      available.set(helper.id, helper);
    }

    return [...available.values()];
  }

  async create(input: {
    userId: string;
    authorName?: string;
    title: unknown;
    emoji?: unknown;
    appearance?: unknown;
    logoUrl?: unknown;
    whenToUse: unknown;
    instructions: unknown;
    submitForReview?: boolean;
  }): Promise<Helper> {
    const db = getDb();
    const id = v4();
    const now = new Date().toISOString();
    const title = clean(input.title, "Helper name", MAX_HELPER_TITLE_LENGTH);
    const helper: Helper = {
      id,
      slug: makeSlug(title, id),
      title,
      emoji:
        typeof input.emoji === "string" && input.emoji.trim()
          ? input.emoji.trim().slice(0, 12)
          : "📖",
      appearance:
        input.appearance === "logo" &&
        typeof input.logoUrl === "string" &&
        input.logoUrl.trim()
          ? "logo"
          : "emoji",
      logoUrl: typeof input.logoUrl === "string" ? input.logoUrl.trim() : "",
      whenToUse: clean(
        input.whenToUse,
        "When to use",
        MAX_HELPER_WHEN_TO_USE_LENGTH,
      ),
      instructions: clean(
        input.instructions,
        "Instructions",
        MAX_HELPER_INSTRUCTIONS_LENGTH,
      ),
      authorId: input.userId,
      authorName: input.authorName?.trim() || "Sakhi member",
      status: input.submitForReview ? "pending_review" : "draft",
      verificationStatus: "unverified",
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(HELPERS).doc(id).set(helper);
    return helper;
  }

  async update(input: {
    id: string;
    userId: string;
    title?: unknown;
    emoji?: unknown;
    appearance?: unknown;
    logoUrl?: unknown;
    whenToUse?: unknown;
    instructions?: unknown;
    status?: unknown;
  }): Promise<Helper> {
    const db = getDb();
    const ref = db.collection(HELPERS).doc(input.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("Helper not found");
    const helper = normalizeHelper(snapshot.id, snapshot.data()!);
    if (helper.authorId !== input.userId) throw new Error("Forbidden");

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined)
      patch.title = clean(input.title, "Helper name", MAX_HELPER_TITLE_LENGTH);
    if (input.emoji !== undefined)
      patch.emoji =
        typeof input.emoji === "string" && input.emoji.trim()
          ? input.emoji.trim().slice(0, 12)
          : "📖";
    if (input.appearance !== undefined)
      patch.appearance = input.appearance === "logo" ? "logo" : "emoji";
    if (input.logoUrl !== undefined)
      patch.logoUrl =
        typeof input.logoUrl === "string" ? input.logoUrl.trim() : "";
    if (input.whenToUse !== undefined)
      patch.whenToUse = clean(
        input.whenToUse,
        "When to use",
        MAX_HELPER_WHEN_TO_USE_LENGTH,
      );
    if (input.instructions !== undefined)
      patch.instructions = clean(
        input.instructions,
        "Instructions",
        MAX_HELPER_INSTRUCTIONS_LENGTH,
      );
    if (input.status !== undefined) {
      if (input.status !== "draft" && input.status !== "pending_review") {
        throw new Error("Invalid Helper status");
      }
      patch.status = input.status;
    }

    const contentChanged =
      input.title !== undefined ||
      input.emoji !== undefined ||
      input.appearance !== undefined ||
      input.logoUrl !== undefined ||
      input.whenToUse !== undefined ||
      input.instructions !== undefined;
    if (helper.status === "published" && contentChanged) {
      patch.status = "pending_review";
      patch.verificationStatus = "unverified";
    }
    if (helper.status === "rejected" && contentChanged) {
      patch.status = "pending_review";
    }
    if (patch.status === "pending_review") patch.rejectionReason = "";
    await ref.update(patch);
    return normalizeHelper(input.id, { ...snapshot.data(), ...patch });
  }

  async remove(id: string, userId: string) {
    const db = getDb();
    const ref = db.collection(HELPERS).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("Helper not found");
    if (snapshot.data()?.authorId !== userId) throw new Error("Forbidden");
    await ref.update({ status: "removed", updatedAt: new Date().toISOString() });
  }

  async addToUser(userId: string, helperId: string) {
    const db = getDb();
    const helper = await db.collection(HELPERS).doc(helperId).get();
    if (!helper.exists || helper.data()?.status !== "published") {
      throw new Error("Only shared Helpers can be added");
    }
    const value: UserHelper = {
      helperId,
      autoUse: true,
      addedAt: new Date().toISOString(),
    };
    await db
      .collection(USERS)
      .doc(userId)
      .collection(USER_HELPERS)
      .doc(helperId)
      .set(value);
  }

  async removeFromUser(userId: string, helperId: string) {
    await getDb()
      .collection(USERS)
      .doc(userId)
      .collection(USER_HELPERS)
      .doc(helperId)
      .delete();
  }

  async recordUsage(helperId: string) {
    await getDb()
      .collection(HELPERS)
      .doc(helperId)
      .update({ usageCount: FieldValue.increment(1) });
  }

  async getAccessibleBySlug(userId: string, slug: string) {
    const helpers = await this.getAvailableHelpers(userId);
    return helpers.find((helper) => helper.slug === slug) ?? null;
  }
}

const helperServerService = new HelperServerService();
export default helperServerService;
