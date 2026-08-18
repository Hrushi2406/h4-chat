import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processWhatsAppMessage } from "@/lib/whatsapp/processor";
import type { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import type { WhatsAppStore } from "@/lib/whatsapp/store";
import { generateChatTitleFromFirstMessage } from "@/lib/services/chat-title-server-service";

vi.mock("@/lib/services/chat-title-server-service", () => ({
  generateChatTitleFromFirstMessage: vi.fn().mockResolvedValue("Plan My Day"),
}));

const inbound = {
  id: "wamid.inbound",
  from: "919999999999",
  phoneNumberId: "phone-id",
  timestamp: new Date("2026-08-17T10:00:00.000Z"),
  type: "text" as const,
  originalType: "text",
  text: "Plan my day",
};

const account = {
  phoneNumber: inbound.from,
  userId: "user-1",
  consent: "accepted" as const,
  optedOut: false,
  blocked: false,
  modelId: "deepseek/deepseek-v4-flash",
  pendingMessageIds: [],
  requiresWebLink: false,
  welcomeCreditsGranted: true,
};

const createStore = () => ({
  claimInbound: vi.fn().mockResolvedValue(inbound),
  claimPhoneWork: vi.fn().mockResolvedValue(account),
  releasePhoneWork: vi.fn().mockResolvedValue(undefined),
  completePhoneWork: vi.fn().mockResolvedValue(undefined),
  getAccount: vi.fn().mockResolvedValue(account),
  createThread: vi.fn().mockResolvedValue("thread-1"),
  appendThreadMessage: vi.fn().mockResolvedValue([
    { id: "user-message", role: "user", content: inbound.text },
  ]),
  updateAccount: vi.fn().mockResolvedValue(undefined),
  cancelQueuedWork: vi.fn().mockResolvedValue(0),
  getThreadMessages: vi.fn().mockResolvedValue([]),
  finishInbound: vi.fn().mockResolvedValue(undefined),
  recordOutbound: vi.fn().mockResolvedValue(undefined),
  getCreditSummary: vi.fn().mockResolvedValue({ available: 900, ratio: 0.9 }),
  isCancellationRequested: vi.fn().mockResolvedValue(false),
  applyGeneratedThreadTitle: vi.fn().mockResolvedValue(undefined),
  storeMedia: vi.fn().mockResolvedValue(undefined),
});

const createMeta = () => ({
  markRead: vi.fn().mockResolvedValue({ success: true }),
  sendText: vi.fn().mockResolvedValue({ messageId: "wamid.outbound" }),
  sendButtons: vi.fn().mockResolvedValue({ messageId: "wamid.buttons" }),
  uploadMedia: vi.fn().mockResolvedValue("media-1"),
  sendMedia: vi.fn().mockResolvedValue({ messageId: "wamid.media" }),
  sendMediaUrl: vi.fn().mockResolvedValue({ messageId: "wamid.media-link" }),
});

describe("WhatsApp processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts read and typing before the phone work claim can delay processing", async () => {
    const store = createStore();
    let releasePhoneClaim: ((value: typeof account) => void) | undefined;
    store.claimPhoneWork.mockImplementation(() => new Promise((resolve) => {
      releasePhoneClaim = resolve;
    }));
    const meta = createMeta();
    const processing = processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Here’s a focused plan.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      }),
      baseUrl: "https://trysakhi.com",
    });

    await vi.waitFor(() => expect(store.claimPhoneWork).toHaveBeenCalledTimes(1));
    expect(meta.markRead).toHaveBeenCalledWith(inbound.id, true);

    releasePhoneClaim?.(account);
    await processing;
  });

  it("uses work claimed by the webhook without repeating either claim", async () => {
    const store = createStore();
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Done",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 1,
        inputTokens: 10,
        outputTokens: 3,
      }),
      baseUrl: "https://trysakhi.com",
    }, { message: inbound, account });

    expect(store.claimInbound).not.toHaveBeenCalled();
    expect(store.claimPhoneWork).not.toHaveBeenCalled();
    expect(meta.markRead).not.toHaveBeenCalledWith(inbound.id, true);
    expect(meta.sendText).toHaveBeenCalledWith(inbound.from, "Done", inbound.id);
  });

  it("marks text read, persists both sides, and delivers the Sakhi answer", async () => {
    const store = createStore();
    const meta = createMeta();
    const runConversation = vi.fn().mockResolvedValue({
      text: "Here’s a focused plan.",
      parts: [
        {
          type: "tool-GMAIL_FETCH_EMAILS",
          toolCallId: "call-gmail",
          state: "output-available",
          input: { query: "newer_than:1d" },
          output: { messages: [] },
        },
        { type: "text", text: "Here’s a focused plan." },
      ],
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 2,
      inputTokens: 20,
      outputTokens: 10,
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation,
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
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            type: "tool-GMAIL_FETCH_EMAILS",
            state: "output-available",
          }),
          { type: "text", text: "Here’s a focused plan." },
        ],
      }),
    );
    expect(meta.sendText).toHaveBeenCalledWith(inbound.from, "Here’s a focused plan.", inbound.id);
    expect(store.getAccount).not.toHaveBeenCalled();
    expect(store.getThreadMessages).toHaveBeenCalledExactlyOnceWith("thread-1");
    expect(console.info).toHaveBeenCalledWith(
      "[whatsapp-pipeline-timing]",
      expect.objectContaining({
        event: "stage.completed",
        messageId: inbound.id,
        stage: "processor.claim_phone_and_load_account",
        durationMs: expect.any(Number),
      }),
    );
    for (const stage of [
      "processor.check_cancellation_after_generation",
      "processor.format_answer",
      "processor.persist_assistant_message",
      "processor.get_credit_summary",
      "processor.finish_inbound.completed",
      "processor.complete_phone_work",
    ]) {
      expect(console.info).toHaveBeenCalledWith(
        "[whatsapp-pipeline-timing]",
        expect.objectContaining({
          event: "stage.completed",
          messageId: inbound.id,
          stage,
          durationMs: expect.any(Number),
        }),
      );
    }
    expect(store.finishInbound).toHaveBeenCalledWith(inbound.id, "completed");
  });

  it("sends a document straight to the conversation instead of analyzing it first", async () => {
    const document = {
      ...inbound,
      id: "wamid.document",
      type: "document" as const,
      originalType: "document",
      text: "Unlock this pdf and send me as pdf",
      media: {
        id: "media-1",
        mimeType: "application/pdf",
        filename: "statement.pdf",
        isVoice: false,
      },
    };
    const store = createStore();
    store.claimInbound.mockResolvedValue(document);
    store.storeMedia.mockResolvedValue({
      id: document.id,
      name: "statement.pdf",
      url: "https://firebasestorage.googleapis.com/statement.pdf",
      contentType: "application/pdf",
    });
    const meta = createMeta();
    const downloadMedia = vi.fn().mockResolvedValue({
      bytes: new ArrayBuffer(8),
      mimeType: "application/pdf",
    });
    const analyzeMedia = vi.fn();
    const runConversation = vi.fn().mockResolvedValue({
      text: "That PDF is locked, send an unlocked copy",
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 2,
      inputTokens: 20,
      outputTokens: 10,
    });

    await processWhatsAppMessage(document.id, {
      store: store as unknown as WhatsAppStore,
      meta: { ...meta, downloadMedia } as unknown as MetaWhatsAppClient,
      runConversation,
      analyzeMedia,
      baseUrl: "https://trysakhi.com",
    });

    expect(analyzeMedia).not.toHaveBeenCalled();
    expect(runConversation.mock.calls[0][0].messages).toEqual([
      {
        role: "user",
        content:
          "Unlock this pdf and send me as pdf\n\n[Attached file: statement.pdf]\n\nUploaded file URLs available in this thread:\n- statement.pdf (application/pdf): https://firebasestorage.googleapis.com/statement.pdf",
      },
    ]);
  });

  it("gives follow-up turns the uploaded file URLs from earlier messages", async () => {
    const store = createStore();
    store.getThreadMessages.mockResolvedValue([
      {
        id: "earlier-user-message",
        role: "user",
        content: "[Analysis of invoice.pdf]\nTotal is 4,200",
        parts: [
          { type: "text", text: "[Analysis of invoice.pdf]\nTotal is 4,200" },
          {
            type: "file",
            mediaType: "application/pdf",
            filename: "invoice.pdf",
            url: "https://firebasestorage.googleapis.com/invoice.pdf",
          },
        ],
        metadata: { whatsappMessageId: "wamid.earlier" },
      },
      {
        id: "earlier-assistant-message",
        role: "assistant",
        content: "The invoice totals 4,200",
      },
    ]);
    const meta = createMeta();
    const runConversation = vi.fn().mockResolvedValue({
      text: "Sent it over",
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 2,
      inputTokens: 20,
      outputTokens: 10,
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation,
      baseUrl: "https://trysakhi.com",
    });

    const messages = runConversation.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({
      role: "user",
      content: `${inbound.text}\n\nUploaded file URLs available in this thread:\n- invoice.pdf (application/pdf): https://firebasestorage.googleapis.com/invoice.pdf`,
    });
  });

  it("starts the durable account update while the user message is still being stored", async () => {
    const store = createStore();
    let releaseUserMessage: (() => void) | undefined;
    store.appendThreadMessage.mockImplementationOnce(
      () => new Promise<unknown[]>((resolve) => {
        releaseUserMessage = () => resolve([
          { id: "user-message", role: "user", content: inbound.text },
        ]);
      }),
    );
    const meta = createMeta();
    const runConversation = vi.fn().mockResolvedValue({
      text: "Here’s a focused plan.",
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 2,
      inputTokens: 20,
      outputTokens: 10,
    });
    const processing = processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation,
      baseUrl: "https://trysakhi.com",
    });

    await vi.waitFor(() => expect(store.appendThreadMessage).toHaveBeenCalledTimes(1));
    expect(store.updateAccount).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(runConversation).toHaveBeenCalledTimes(1));
    expect(runConversation).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ role: "user", content: inbound.text })],
    }));
    expect(meta.sendText).not.toHaveBeenCalled();
    releaseUserMessage?.();
    await processing;
    expect(meta.sendText).toHaveBeenCalledWith(
      inbound.from,
      "Here’s a focused plan.",
      inbound.id,
    );
  });

  it("starts final delivery before assistant persistence finishes", async () => {
    const store = createStore();
    let releaseAssistantMessage: (() => void) | undefined;
    store.appendThreadMessage
      .mockResolvedValueOnce([{ id: "user-message", role: "user", content: inbound.text }])
      .mockImplementationOnce(() => new Promise<unknown[]>((resolve) => {
        releaseAssistantMessage = () => resolve([
          { id: "assistant-message", role: "assistant", content: "Done" },
        ]);
      }));
    const meta = createMeta();
    const processing = processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Done",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 1,
        inputTokens: 10,
        outputTokens: 3,
      }),
      baseUrl: "https://trysakhi.com",
    });

    await vi.waitFor(() => expect(store.appendThreadMessage).toHaveBeenCalledTimes(2));
    const sentBeforePersistenceFinished = meta.sendText.mock.calls.length === 1;
    releaseAssistantMessage?.();
    await processing;

    expect(sentBeforePersistenceFinished).toBe(true);
  });

  it("starts non-visible completion work concurrently after delivery", async () => {
    const store = createStore();
    let releaseCreditSummary: (() => void) | undefined;
    store.getCreditSummary.mockImplementation(() => new Promise((resolve) => {
      releaseCreditSummary = () => resolve({ available: 900, ratio: 0.9 });
    }));
    const meta = createMeta();
    const processing = processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Done",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 1,
        inputTokens: 10,
        outputTokens: 3,
      }),
      baseUrl: "https://trysakhi.com",
    });

    await vi.waitFor(() => expect(store.getCreditSummary).toHaveBeenCalledTimes(1));
    const completionStartedBeforeCreditSummaryFinished =
      store.completePhoneWork.mock.calls.length === 1 &&
      store.finishInbound.mock.calls.length === 1;
    releaseCreditSummary?.();
    await processing;

    expect(completionStartedBeforeCreditSummaryFinished).toBe(true);
  });

  it("prefetches active-thread history while checking cancellation", async () => {
    const store = createStore();
    store.claimPhoneWork.mockResolvedValue({
      ...account,
      activeThreadId: "thread-1",
      lastConversationAt: new Date("2026-08-17T09:59:00.000Z"),
    });
    let releaseCancellation: ((cancelled: boolean) => void) | undefined;
    store.isCancellationRequested.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseCancellation = resolve;
      }),
    );
    const processing = processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: createMeta() as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Here’s a focused plan.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      }),
      baseUrl: "https://trysakhi.com",
      now: () => inbound.timestamp,
    });

    await vi.waitFor(() => expect(store.isCancellationRequested).toHaveBeenCalledTimes(1));
    expect(store.getThreadMessages).toHaveBeenCalledExactlyOnceWith("thread-1");
    releaseCancellation?.(false);
    await processing;
  });

  it("converts web Markdown bold to WhatsApp bold before storing and sending", async () => {
    const store = createStore();
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: 'Done — check for "**Your Saturday Email Summary**".',
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      }),
      baseUrl: "https://trysakhi.com",
    });

    const expected = 'Done, check for "*Your Saturday Email Summary*".';
    expect(store.appendThreadMessage).toHaveBeenNthCalledWith(
      2,
      "thread-1",
      "assistant",
      expected,
      expect.any(Object),
    );
    expect(meta.sendText).toHaveBeenCalledWith(inbound.from, expected, inbound.id);
  });

  it("sends only the model-authored answer, never hardcoded tool progress", async () => {
    const store = createStore();
    const meta = createMeta();
    const runConversation = vi.fn().mockResolvedValue({
      text: "You have three unread emails. The newest is from Alex.",
      modelId: "deepseek/deepseek-v4-flash",
      creditsUsed: 2,
      inputTokens: 20,
      outputTokens: 10,
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: runConversation as never,
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendText).toHaveBeenCalledTimes(1);
    expect(meta.sendText).toHaveBeenCalledWith(
      inbound.from,
      "You have three unread emails. The newest is from Alex.",
      inbound.id,
    );
    expect(runConversation).toHaveBeenCalledWith(
      expect.not.objectContaining({ onProgress: expect.anything() }),
    );
  });

  it("sends model-authored progress during noticeable tool work", async () => {
    const store = createStore();
    const meta = createMeta();
    const runConversation = vi.fn().mockImplementation(async (input: {
      sendWhatsAppUpdate?: (message: string) => Promise<void>;
    }) => {
      await input.sendWhatsAppUpdate?.("I’m checking your unread emails now.");
      return {
        text: "You have three unread emails. The newest is from Alex.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      };
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: runConversation as never,
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendText).toHaveBeenNthCalledWith(
      1,
      inbound.from,
      "I’m checking your unread emails now.",
      undefined,
    );
    expect(meta.sendText).toHaveBeenNthCalledWith(
      2,
      inbound.from,
      "You have three unread emails. The newest is from Alex.",
      inbound.id,
    );
    expect(meta.markRead).toHaveBeenCalledTimes(2);
    expect(meta.markRead.mock.invocationCallOrder[1]).toBeLessThan(
      store.recordOutbound.mock.invocationCallOrder[0],
    );
  });

  it("persists progress without an undefined reply ID so a sent update is not retried", async () => {
    const store = createStore();
    store.recordOutbound.mockImplementation(async (record: {
      retryPayload?: { replyToMessageId?: string };
    }) => {
      if (
        record.retryPayload &&
        "replyToMessageId" in record.retryPayload &&
        record.retryPayload.replyToMessageId === undefined
      ) {
        throw new Error("Firestore does not support undefined values");
      }
    });
    const meta = createMeta();
    const runConversation = vi.fn().mockImplementation(async (input: {
      sendWhatsAppUpdate?: (message: string) => Promise<void>;
    }) => {
      try {
        await input.sendWhatsAppUpdate?.("Checking your inbox for today's emails 📬");
      } catch {
        await input.sendWhatsAppUpdate?.("Checking your inbox for today's emails 📬");
      }
      return {
        text: "There are no new emails today.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      };
    });

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: runConversation as never,
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.sendText).toHaveBeenCalledTimes(2);
    expect(meta.sendText).toHaveBeenNthCalledWith(
      1,
      inbound.from,
      "Checking your inbox for today's emails 📬",
      undefined,
    );
    expect(meta.sendText).toHaveBeenNthCalledWith(
      2,
      inbound.from,
      "There are no new emails today.",
      inbound.id,
    );
  });

  it("delivers the model-authored WhatsApp buttons and media", async () => {
    const store = createStore();
    const meta = createMeta();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new Uint8Array([1, 2, 3]),
      { headers: { "content-type": "image/png", "content-length": "3" } },
    )));

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "I made the summary. Choose what I should check next.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
        whatsappPresentation: {
          buttons: {
            body: "Which inbox should I check next?",
            buttons: [
              { id: "Check work inbox", title: "Work" },
              { id: "Check personal inbox", title: "Personal" },
            ],
          },
          media: [{
            url: "https://storage.googleapis.com/sakhi/report.png",
            kind: "image",
            caption: "Your email summary",
            filename: "summary.png",
          }, {
            url: "https://images.example.com/generated.png",
            kind: "image",
            caption: "A generated option",
          }],
        },
      }),
      baseUrl: "https://trysakhi.com",
    });

    expect(meta.uploadMedia).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "image/png",
      "summary.png",
    );
    expect(meta.sendMedia).toHaveBeenCalledWith(
      inbound.from,
      "image",
      "media-1",
      { caption: "Your email summary", filename: "summary.png" },
    );
    expect(meta.sendMediaUrl).toHaveBeenCalledWith(
      inbound.from,
      "image",
      "https://images.example.com/generated.png",
      { caption: "A generated option" },
    );
    expect(meta.sendButtons).toHaveBeenCalledWith(
      inbound.from,
      "Which inbox should I check next?",
      [
        { id: "Check work inbox", title: "Work" },
        { id: "Check personal inbox", title: "Personal" },
      ],
    );
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
    store.claimPhoneWork.mockResolvedValue({
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
    store.claimPhoneWork.mockResolvedValue({
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
    store.claimPhoneWork.mockResolvedValue({
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
    store.claimPhoneWork.mockResolvedValue({
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
    store.claimPhoneWork.mockResolvedValue({
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
      baseUrl: "https://trysakhi.com",
    });

    expect(transcribe).not.toHaveBeenCalled();
    expect(store.finishInbound).toHaveBeenCalledWith(
      audioInbound.id,
      "failed",
      expect.stringContaining("Ogg/Opus"),
    );
  });

  it("titles a thread from the first user message, the way web chat does", async () => {
    const store = createStore();
    const meta = createMeta();
    vi.mocked(generateChatTitleFromFirstMessage).mockResolvedValue("Plan My Day");

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Here’s a focused plan.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      }),
      baseUrl: "https://trysakhi.com",
      now: () => inbound.timestamp,
    });

    expect(generateChatTitleFromFirstMessage).toHaveBeenCalledWith(inbound.text);
    await vi.waitFor(() =>
      expect(store.applyGeneratedThreadTitle).toHaveBeenCalledWith(
        "thread-1",
        "Plan My Day",
      ),
    );
  });

  it("leaves the title alone once the thread already has a user message", async () => {
    const store = createStore();
    store.getThreadMessages.mockResolvedValue([
      { id: "earlier", role: "user", content: "Hi", metadata: {} },
    ]);
    const meta = createMeta();

    await processWhatsAppMessage(inbound.id, {
      store: store as unknown as WhatsAppStore,
      meta: meta as unknown as MetaWhatsAppClient,
      runConversation: vi.fn().mockResolvedValue({
        text: "Here’s a focused plan.",
        modelId: "deepseek/deepseek-v4-flash",
        creditsUsed: 2,
        inputTokens: 20,
        outputTokens: 10,
      }),
      baseUrl: "https://trysakhi.com",
      now: () => inbound.timestamp,
    });

    expect(generateChatTitleFromFirstMessage).not.toHaveBeenCalled();
    expect(store.applyGeneratedThreadTitle).not.toHaveBeenCalled();
  });
});
