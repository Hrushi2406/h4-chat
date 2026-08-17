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
