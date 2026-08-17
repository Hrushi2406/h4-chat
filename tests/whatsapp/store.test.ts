import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

type Stored = Record<string, unknown>;

const createFakeFirestore = (seed: Record<string, Stored> = {}) => {
  const documents = new Map(Object.entries(seed));
  const snapshot = (path: string) => ({
    exists: documents.has(path),
    id: path.split("/").at(-1),
    data: () => documents.get(path),
    ref: documentRef(path),
  });
  function documentRef(path: string) {
    return {
      path,
      get: async () => snapshot(path),
      set: async (value: Stored, options?: { merge?: boolean }) => {
        documents.set(path, options?.merge ? { ...documents.get(path), ...value } : value);
      },
      update: async (value: Stored) => {
        documents.set(path, { ...documents.get(path), ...value });
      },
    };
  }
  const transaction = {
    get: async (ref: { path: string }) => snapshot(ref.path),
    set: (ref: { path: string }, value: Stored, options?: { merge?: boolean }) => {
      documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...value } : value);
    },
    update: (ref: { path: string }, value: Stored) => {
      documents.set(ref.path, { ...documents.get(ref.path), ...value });
    },
    create: (ref: { path: string }, value: Stored) => documents.set(ref.path, value),
    delete: (ref: { path: string }) => documents.delete(ref.path),
  };
  return {
    documents,
    collection: (name: string) => ({
      doc: (id: string) => documentRef(`${name}/${id}`),
    }),
    runTransaction: async <T>(callback: (value: typeof transaction) => Promise<T>) => callback(transaction),
  };
};

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  getAdminAuth: vi.fn(),
  getAdminStorage: vi.fn(),
}));

vi.mock("@/lib/clients/firebase-admin", () => mocks);

import { mergeCreditUsageDocuments, WhatsAppStore } from "@/lib/whatsapp/store";

describe("WhatsAppStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("recovers a phone-number work claim after its ten-minute lease expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:20:00.000Z"));
    const database = createFakeFirestore({
      "whatsappAccounts/919999999999": {
        phoneNumber: "919999999999",
        activeMessageId: "wamid.crashed",
        activeMessageClaimedAt: Timestamp.fromDate(new Date("2026-08-17T10:09:59.000Z")),
        pendingMessageIds: [],
      },
      "whatsappInbox/wamid.next": { status: "processing" },
    });
    mocks.getAdminFirestore.mockReturnValue(database);
    const store = new WhatsAppStore();

    await expect(store.claimPhoneWork("+91 99999 99999", "wamid.next")).resolves.toBe(true);
    await expect(store.getAccount("+91 99999 99999")).resolves.toMatchObject({
      activeMessageId: "wamid.next",
    });
  });

  it("queues work while the current phone-number lease is fresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:05:00.000Z"));
    const database = createFakeFirestore({
      "whatsappAccounts/919999999999": {
        phoneNumber: "919999999999",
        activeMessageId: "wamid.active",
        activeMessageClaimedAt: Timestamp.fromDate(new Date("2026-08-17T10:00:00.000Z")),
        pendingMessageIds: [],
      },
      "whatsappInbox/wamid.next": { status: "processing" },
    });
    mocks.getAdminFirestore.mockReturnValue(database);
    const store = new WhatsAppStore();

    await expect(store.claimPhoneWork("919999999999", "wamid.next")).resolves.toBe(false);
    await expect(store.getAccount("919999999999")).resolves.toMatchObject({
      activeMessageId: "wamid.active",
      pendingMessageIds: ["wamid.next"],
    });
    expect(database.documents.get("whatsappInbox/wamid.next")).toMatchObject({
      status: "accepted",
      processingStartedAt: null,
    });
  });

  it("promotes the next queued message when active work releases", async () => {
    const database = createFakeFirestore({
      "whatsappAccounts/919999999999": {
        phoneNumber: "919999999999",
        activeMessageId: "wamid.active",
        pendingMessageIds: ["wamid.next", "wamid.after"],
      },
    });
    mocks.getAdminFirestore.mockReturnValue(database);
    const store = new WhatsAppStore();

    await expect(store.releasePhoneWork("919999999999", "wamid.active")).resolves.toBe("wamid.next");
    await expect(store.getAccount("919999999999")).resolves.toMatchObject({
      activeMessageId: "wamid.next",
      pendingMessageIds: ["wamid.after"],
    });
  });

  it("counts expired credit entries independently from grant entries", () => {
    const merged = mergeCreditUsageDocuments(undefined, {
      usage: [
        { id: "expired-only", type: "expiry", creditsExpired: 7 },
        { id: "grant", type: "grant", creditsGranted: 10, creditsExpired: 2 },
      ],
    });

    expect(merged.totalCreditsExpired).toBe(9);
    expect(merged.totalCreditsGranted).toBe(10);
  });

  it("refuses phone-side consent after a web-side disconnect", async () => {
    const database = createFakeFirestore({
      "whatsappAccounts/919999999999": {
        phoneNumber: "919999999999",
        consent: "pending",
        requiresWebLink: true,
      },
    });
    mocks.getAdminFirestore.mockReturnValue(database);
    const store = new WhatsAppStore();

    await expect(store.acceptConsent("919999999999")).rejects.toThrow(
      "reconnected from Sakhi Settings",
    );
    expect(mocks.getAdminAuth).not.toHaveBeenCalled();
  });
});
