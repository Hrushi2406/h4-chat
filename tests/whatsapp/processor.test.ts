import { beforeEach, describe, expect, it, vi } from "vitest";
import { processWhatsAppMessage } from "@/lib/whatsapp/processor";
import type { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import type { WhatsAppStore } from "@/lib/whatsapp/store";

const inbound = {
  id: "wamid.inbound",
  from: "919999999999",
  phoneNumberId: "phone-id",
  timestamp: new Date("2026-08-17T10:00:00.000Z"),
  type: "text" as const,
  originalType: "text",
  text: "Plan my day",
};

const createStore = () => ({
  claimInbound: vi.fn().mockResolvedValue(inbound),
  claimPhoneWork: vi.fn().mockResolvedValue(true),
  releasePhoneWork: vi.fn().mockResolvedValue(undefined),
  getAccount: vi.fn().mockResolvedValue({
    phoneNumber: inbound.from,
    userId: "user-1",
    consent: "accepted",
    optedOut: false,
    blocked: false,
    modelId: "deepseek/deepseek-v4-flash",
    pendingMessageIds: [],
    welcomeCreditsGranted: true,
  }),
  createThread: vi.fn().mockResolvedValue("thread-1"),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  appendProgress: vi.fn().mockResolvedValue(undefined),
  updateAccount: vi.fn().mockResolvedValue(undefined),
  cancelQueuedWork: vi.fn().mockResolvedValue(0),
  getThreadMessages: vi.fn().mockResolvedValue([{ id: "user-message", role: "user", content: inbound.text, parts: [{ type: "text", text: inbound.text }], updatedAt: inbound.timestamp.toISOString() }]),
  finishInbound: vi.fn().mockResolvedValue(undefined),
  recordOutbound: vi.fn().mockResolvedValue(undefined),
  getCreditSummary: vi.fn().mockResolvedValue({ available: 900, ratio: 0.9 }),
  isCancellationRequested: vi.fn().mockResolvedValue(false),
});

const createMeta = () => ({
  markRead: vi.fn().mockResolvedValue({ success: true }),
  sendText: vi.fn().mockResolvedValue({ messageId: "wamid.outbound" }),
  sendButtons: vi.fn().mockResolvedValue({ messageId: "wamid.buttons" }),
});

describe("WhatsApp processor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks text read, persists both sides, and delivers the Sakhi answer", async () => {
    const store = createStore();
    const meta = createMeta();
    const runConversation = vi.fn().mockResolvedValue({
      text: "Here’s a focused plan.",
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 2,
      inputTokens: 20,
      outputTokens: 10,
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation,
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
      now: () => inbound.timestamp,
    });

    expect(meta.markRead).toHaveBeenCalledWith(inbound.id, true);
    expect(store.appendThreadMessage).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      "user",
      inbound.text,
      expect.any(Object),
    );
    expect(store.appendThreadMessage).toHaveBeenNthCalledWith(
      2,
      "thread-1",
      "assistant",
      "Here’s a focused plan.",
      expect.any(Object),
    );
    expect(meta.sendText).toHaveBeenCalledWith(inbound.from, "Here’s a focused plan.", inbound.id);
    expect(store.finishInbound).toHaveBeenCalledWith(inbound.id, "completed");
  });

  it("delivers a long answer completely across ordered WhatsApp messages", async () => {
    const store = createStore();
    const meta = createMeta();
    const answer = `${"A".repeat(4_200)}${"B".repeat(4_200)}${"C".repeat(600)}`;

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: answer,
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 2_000,
      }),
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
    });

    const delivered = meta.sendText.mock.calls.map((call) => call[1] as string);
    expect(delivered.length).toBe(3);
    expect(delivered.every((chunk) => chunk.length <= 3_900)).toBe(true);
    expect(delivered.join("")).toBe(answer);
  });

  it("does not invent confirmation buttons from model-authored prose", async () => {
    const store = createStore();
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Please confirm the plan with your teammate.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 1,
        inputTokens: 10,
        outputTokens: 8,
      }),
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendText).toHaveBeenCalledWith(
      inbound.from,
      "Please confirm the plan with your teammate.",
      inbound.id,
    );
    expect(meta.sendButtons).not.toHaveBeenCalled();
  });

  it("asks an unknown sender for consent without invoking the model", async () => {
    const store = createStore();
    store.getAccount.mockResolvedValue({
      phoneNumber: inbound.from,
      consent: "pending",
      optedOut: false,
      blocked: false,
      modelId: "deepseek/deepseek-v4-flash",
      pendingMessageIds: [],
      welcomeCreditsGranted: false,
    });
    const meta = createMeta();
    const runConversation = vi.fn();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation,
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendButtons).toHaveBeenCalledWith(
      inbound.from,
      expect.stringContaining("Privacy Policy"),
      [{ id: "continue", title: "Continue" }, { id: "exit", title: "Exit" }],
    );
    expect(runConversation).not.toHaveBeenCalled();
  });

  it("does not repeat a recent consent prompt", async () => {
    const store = createStore();
    store.getAccount.mockResolvedValue({
      phoneNumber: inbound.from,
      consent: "pending",
      consentPromptedAt: new Date("2026-08-17T09:55:00.000Z"),
      optedOut: false,
      blocked: false,
      modelId: "deepseek/deepseek-v4-flash",
      pendingMessageIds: [],
      requiresWebLink: false,
      welcomeCreditsGranted: false,
    });
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      baseUrl: "https://trysakhi.com",
      now: () => inbound.timestamp,
    });

    expect(meta.sendButtons).not.toHaveBeenCalled();
    expect(meta.sendText).not.toHaveBeenCalled();
  });

  it("requires a fresh web link after a web-side disconnect", async () => {
    const store = createStore();
    store.getAccount.mockResolvedValue({
      phoneNumber: inbound.from,
      consent: "pending",
      optedOut: true,
      blocked: false,
      modelId: "deepseek/deepseek-v4-flash",
      pendingMessageIds: [],
      requiresWebLink: true,
      welcomeCreditsGranted: true,
    });
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      baseUrl: "https://trysakhi.com",
      now: () => inbound.timestamp,
    });

    expect(meta.sendText).toHaveBeenCalledWith(
      inbound.from,
      expect.stringContaining("Reconnect WhatsApp from Sakhi Settings"),
      inbound.id,
    );
    expect(meta.sendButtons).not.toHaveBeenCalled();
  });

  it("stays silent after the first cooldown notice", async () => {
    const store = createStore();
    store.getAccount.mockResolvedValue({
      phoneNumber: inbound.from,
      userId: "user-1",
      consent: "accepted",
      optedOut: false,
      blocked: false,
      cooldownUntil: new Date("2026-08-17T10:05:00.000Z"),
      cooldownNotifiedAt: new Date("2026-08-17T10:00:01.000Z"),
      modelId: "deepseek/deepseek-v4-flash",
      pendingMessageIds: [],
      requiresWebLink: false,
      welcomeCreditsGranted: true,
    });
    const meta = createMeta();

    vi.useFakeTimers();
    vi.setSystemTime(inbound.timestamp);
    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      baseUrl: "https://trysakhi.com",
    });
    vi.useRealTimers();

    expect(meta.sendText).not.toHaveBeenCalled();
    expect(meta.sendButtons).not.toHaveBeenCalled();
  });

  it("offers a failed delivery retry only once", async () => {
    const store = createStore();
    store.getAccount.mockResolvedValue({
      phoneNumber: inbound.from,
      userId: "user-1",
      consent: "accepted",
      optedOut: false,
      blocked: false,
      lastFailedOutboundId: "wamid.failed",
      deliveryRetryOfferedFor: "wamid.failed",
      modelId: "deepseek/deepseek-v4-flash",
      pendingMessageIds: [],
      requiresWebLink: false,
      welcomeCreditsGranted: true,
    });
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Done.", modelId: "deepseek/deepseek-v4-flash", creditsUsed: 1,
        inputTokens: 1, outputTokens: 1,
      }),
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendButtons).not.toHaveBeenCalled();
  });

  it("does not let a stale Exit button withdraw consent from an active account", async () => {
    const store = createStore();
    store.claimInbound.mockResolvedValue({
      ...inbound,
      type: "interactive",
      originalType: "interactive",
      text: "exit",
    });
    const meta = createMeta();
    const runConversation = vi.fn();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation,
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
    });

    expect(store.updateAccount).not.toHaveBeenCalledWith(
      inbound.from,
      expect.objectContaining({ consent: "declined" }),
    );
    expect(meta.sendText).toHaveBeenCalledWith(
      inbound.from,
      expect.stringContaining("already connected"),
      inbound.id,
    );
    expect(runConversation).not.toHaveBeenCalled();
  });

  it("releases persisted phone work when STOP arrives", async () => {
    const store = createStore();
    store.claimInbound.mockResolvedValue({ ...inbound, text: "STOP" });
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      baseUrl: "https://trysakhi.com",
    });

    expect(store.cancelQueuedWork).toHaveBeenCalledWith(
      inbound.from,
      { releaseActive: true },
    );
  });

  it("renders durable Confirm and Cancel controls while an action is pending", async () => {
    const store = createStore();
    const meta = createMeta();
    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "I’m ready to send the email to alex@example.com.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 1,
        inputTokens: 10,
        outputTokens: 10,
      }),
      approvalStore: { getPending: vi.fn().mockResolvedValue({
        toolName: "gmail_send_email",
        exactInput: { to: "alex@example.com", body: "Hello" },
      }) },
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendText).toHaveBeenCalledWith(
      inbound.from,
      expect.stringContaining("alex@example.com"),
      inbound.id,
    );
    expect(meta.sendButtons).toHaveBeenCalledWith(
      inbound.from,
      expect.stringContaining("complete exact gmail_send_email"),
      [{ id: "confirm_action", title: "Confirm" }, { id: "cancel_action", title: "Cancel" }],
    );
  });

  it("executes the stored exact action when Confirm is tapped", async () => {
    const store = createStore();
    store.claimInbound.mockResolvedValue({
      ...inbound,
      type: "interactive",
      originalType: "interactive",
      text: "confirm_action",
    });
    store.getAccount.mockResolvedValue({
      phoneNumber: inbound.from,
      userId: "user-1",
      consent: "accepted",
      optedOut: false,
      blocked: false,
      modelId: "deepseek/deepseek-v4-flash",
      activeThreadId: "thread-1",
      lastConversationAt: inbound.timestamp,
      pendingMessageIds: [],
      welcomeCreditsGranted: true,
    });
    const exactInput = {
      to: "alex@example.com",
      subject: "Final plan",
      body: "This exact body must not be regenerated.",
    };
    const approvalStore = {
      getPending: vi.fn().mockResolvedValue(undefined),
      claimPending: vi.fn().mockResolvedValue({
        toolName: "gmail_send_email",
        exactInput,
      }),
    };
    const runConversation = vi.fn().mockResolvedValue({
      text: "Email sent.",
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 1,
      inputTokens: 10,
      outputTokens: 4,
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: createMeta() as unknown as MetaWhatsAppClient,
      runConversation,
      approvalStore,
      baseUrl: "https://trysakhi.com",
    });

    expect(approvalStore.claimPending).toHaveBeenCalledWith("user-1", "thread-1");
    expect(runConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedAction: { toolName: "gmail_send_email", exactInput },
      }),
    );
  });

  it("rejects non-WhatsApp audio before transcription so four-minute enforcement cannot be bypassed", async () => {
    const audioInbound = {
      ...inbound,
      id: "wamid.audio",
      type: "audio" as const,
      originalType: "audio",
      text: undefined,
      media: { id: "media-1", isVoice: true },
    };
    const store = createStore();
    store.claimInbound.mockResolvedValue(audioInbound);
    const meta = {
      ...createMeta(),
      downloadMedia: vi.fn().mockResolvedValue({
        bytes: new ArrayBuffer(20),
        mimeType: "audio/mpeg",
      }),
    };
    const transcribe = vi.fn();

    await processWhatsAppMessage(audioInbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      transcribe,
      approvalStore: { getPending: vi.fn().mockResolvedValue(undefined) },
      baseUrl: "https://trysakhi.com",
    });

    expect(transcribe).not.toHaveBeenCalled();
    expect(store.finishInbound).toHaveBeenCalledWith(
      audioInbound.id,
      "failed",
      expect.stringContaining("Ogg/Opus"),
    );
  });
});
