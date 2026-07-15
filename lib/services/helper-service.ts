import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { v4 } from "uuid";
import { auth, db } from "@/lib/clients/firebase";
import type { Helper, HelperOverview, UserHelper } from "@/lib/types/helper";
import {
  MAX_HELPER_INSTRUCTIONS_LENGTH,
  MAX_HELPER_TITLE_LENGTH,
  MAX_HELPER_WHEN_TO_USE_LENGTH,
} from "@/lib/types/helper";

const getUser = () => {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in is required");
  return user;
};

const clean = (value: string, field: string, max: number) => {
  const result = value.trim();
  if (!result) throw new Error(`${field} is required`);
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

const normalize = (id: string, value: Partial<Helper>): Helper => ({
  id,
  slug: value.slug ?? "",
  title: value.title ?? "",
  emoji: value.emoji?.trim() || "📖",
  appearance: value.appearance === "logo" && value.logoUrl ? "logo" : "emoji",
  logoUrl: value.logoUrl,
  whenToUse: value.whenToUse ?? "",
  instructions: value.instructions ?? "",
  authorId: value.authorId ?? "",
  authorName: value.authorName ?? "Sakhi member",
  status:
    value.status === "pending_review" ||
    value.status === "published" ||
    value.status === "removed"
      ? value.status
      : "draft",
  verificationStatus:
    value.verificationStatus === "verified" ? "verified" : "unverified",
  createdAt: value.createdAt ?? new Date(0).toISOString(),
  updatedAt: value.updatedAt ?? new Date(0).toISOString(),
});

class HelperService {
  async getOverview(): Promise<HelperOverview> {
    const user = getUser();
    const helperCollection = collection(db, "helpers");
    const userLibrary = collection(db, "users", user.uid, "helpers");
    const [published, owned, library] = await Promise.all([
      getDocs(query(helperCollection, where("status", "==", "published"))),
      getDocs(query(helperCollection, where("authorId", "==", user.uid))),
      getDocs(userLibrary),
    ]);

    const addedHelperIds = library.docs
      .filter((item) => item.data().autoUse !== false)
      .map((item) => item.id);
    const addedSnapshots = await Promise.all(
      addedHelperIds.map((id) => getDoc(doc(db, "helpers", id))),
    );

    const helpers = new Map<string, Helper>();
    for (const snapshot of [
      ...published.docs,
      ...owned.docs,
      ...addedSnapshots,
    ]) {
      if (!snapshot.exists()) continue;
      const helper = normalize(snapshot.id, snapshot.data() as Partial<Helper>);
      if (helper.status !== "removed") helpers.set(helper.id, helper);
    }

    return {
      helpers: [...helpers.values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
      addedHelperIds,
      ownedHelperIds: owned.docs
        .filter((item) => item.data().status !== "removed")
        .map((item) => item.id),
    };
  }

  async create(input: {
    title: string;
    emoji: string;
    appearance: "emoji" | "logo";
    logoUrl?: string;
    whenToUse: string;
    instructions: string;
    submitForReview: boolean;
  }): Promise<Helper> {
    const user = getUser();
    const id = v4();
    const now = new Date().toISOString();
    const title = clean(input.title, "Helper name", MAX_HELPER_TITLE_LENGTH);
    const helper: Helper = {
      id,
      slug: makeSlug(title, id),
      title,
      emoji: input.emoji.trim().slice(0, 12) || "📖",
      appearance: input.appearance === "logo" && input.logoUrl ? "logo" : "emoji",
      logoUrl: input.logoUrl?.trim() || "",
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
      authorId: user.uid,
      authorName: user.displayName?.trim() || "Sakhi member",
      status: input.submitForReview ? "pending_review" : "draft",
      verificationStatus: "unverified",
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "helpers", id), helper);
    return helper;
  }

  async update(input: {
    helperId: string;
    title?: string;
    emoji?: string;
    appearance?: "emoji" | "logo";
    logoUrl?: string;
    whenToUse?: string;
    instructions?: string;
    status?: "draft" | "pending_review";
  }): Promise<Helper> {
    const user = getUser();
    const ref = doc(db, "helpers", input.helperId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw new Error("Helper not found");
    const current = normalize(snapshot.id, snapshot.data() as Partial<Helper>);
    if (current.authorId !== user.uid) throw new Error("You cannot edit this Helper");

    const patch: Partial<Helper> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined)
      patch.title = clean(input.title, "Helper name", MAX_HELPER_TITLE_LENGTH);
    if (input.emoji !== undefined)
      patch.emoji = input.emoji.trim().slice(0, 12) || "📖";
    if (input.appearance !== undefined)
      patch.appearance = input.appearance;
    if (input.logoUrl !== undefined)
      patch.logoUrl = input.logoUrl.trim();
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
    if (input.status !== undefined) patch.status = input.status;

    const contentChanged =
      input.title !== undefined ||
      input.emoji !== undefined ||
      input.appearance !== undefined ||
      input.logoUrl !== undefined ||
      input.whenToUse !== undefined ||
      input.instructions !== undefined;
    if (current.status === "published" && contentChanged) {
      patch.status = "pending_review";
      patch.verificationStatus = "unverified";
    }

    await updateDoc(ref, patch);
    return normalize(input.helperId, { ...current, ...patch });
  }

  async remove(helperId: string) {
    const user = getUser();
    const ref = doc(db, "helpers", helperId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw new Error("Helper not found");
    if (snapshot.data().authorId !== user.uid)
      throw new Error("You cannot remove this Helper");
    await updateDoc(ref, {
      status: "removed",
      updatedAt: new Date().toISOString(),
    });
  }

  async add(helperId: string) {
    const user = getUser();
    const helper = await getDoc(doc(db, "helpers", helperId));
    if (!helper.exists() || helper.data().status !== "published") {
      throw new Error("Only shared Helpers can be added");
    }
    const value: UserHelper = {
      helperId,
      autoUse: true,
      addedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", user.uid, "helpers", helperId), value);
  }

  async unadd(helperId: string) {
    const user = getUser();
    await deleteDoc(doc(db, "users", user.uid, "helpers", helperId));
  }
}

const helperService = new HelperService();
export default helperService;
