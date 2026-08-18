import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
}));

vi.mock("@/lib/chat/server-conversation-context", () => ({
  createServerConversationContext: mocks.createContext,
  getConversationProviderOptions: () => ({}),
}));

import { runSakhiConversation } from "@/lib/services/sakhi-conversation-runner";

describe("Sakhi WhatsApp conversation runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates context and checks final cancellation concurrently", async () => {
    let releaseContext: (() => void) | undefined;
    let releaseCancellation: (() => void) | undefined;
    mocks.createContext.mockImplementation(() => new Promise((resolve) => {
      releaseContext = () => resolve({ system: "You are Sakhi.", tools: {}, mcpClients: [] });
    }));
    const shouldCancel = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => {
      releaseCancellation = () => resolve(false);
    }));
    const running = runSakhiConversation({
      userId: "user-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "Hi" }],
      channel: "whatsapp",
      channelMessageId: "wamid.concurrent",
      shouldCancel,
    }, {
      generate: vi.fn().mockResolvedValue({
        text: "Hi",
        totalUsage: { inputTokens: 1, outputTokens: 1 },
        steps: [],
      }) as never,
      checkAccess: vi.fn().mockResolvedValue({
        userData: {},
        availableCredits: 100,
        plan: { creditMultiplier: 1 },
      }) as never,
      deduct: vi.fn().mockResolvedValue({
        deductedCredits: 1,
        consumedCredits: 1,
        billing: {},
      }) as never,
    });

    await vi.waitFor(() => expect(mocks.createContext).toHaveBeenCalledTimes(1));
    const cancellationStartedBeforeContextFinished = shouldCancel.mock.calls.length === 1;
    releaseContext?.();
    await vi.waitFor(() => expect(shouldCancel).toHaveBeenCalledTimes(1));
    releaseCancellation?.();
    await running;

    expect(cancellationStartedBeforeContextFinished).toBe(true);
  });

  it("gives WhatsApp generateText direct access to messaging tools", async () => {
    const timingLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const exactInput = {
      to: "alex@example.com",
      subject: "Final plan",
      body: "See you tomorrow.",
    };
    const execute = vi.fn().mockResolvedValue({ sent: true, messageId: "email-1" });
    mocks.createContext.mockResolvedValue({
      system: "You are Sakhi.",
      tools: { gmail_send_email: { execute } },
      mcpClients: [],
    });
    const sendWhatsAppUpdate = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockImplementation(async ({ tools, prepareStep }) => {
      const gated = await tools.gmail_send_email.execute(exactInput);
      expect(gated).toEqual(expect.objectContaining({
        progressUpdateRequired: true,
      }));
      expect(execute).not.toHaveBeenCalled();
      expect(prepareStep({
        stepNumber: 1,
        steps: [],
        messages: [],
      })).toEqual(expect.objectContaining({
        toolChoice: {
          type: "tool",
          toolName: "WHATSAPP_SEND_PROGRESS_UPDATE",
        },
      }));
      await tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
        stage: "acting",
        message: "**Checking the details before I send this.**\n",
      });
      await tools.present_whatsapp_buttons.execute({
        body: "Which inbox should I check next?",
        buttons: [
          { id: "Check work inbox", title: "Work" },
          { id: "Check personal inbox", title: "Personal" },
        ],
      });
      await tools.present_whatsapp_media.execute({
        url: "https://storage.googleapis.com/sakhi/report.png",
        kind: "image",
        caption: "Your email summary",
        filename: "summary.png",
      });
      return {
        text: "Done — I sent it to Alex.",
        totalUsage: { inputTokens: 5, outputTokens: 3 },
        steps: [],
      };
    });
    const deduct = vi.fn().mockResolvedValue({
      deductedCredits: 2,
      consumedCredits: 2,
      billing: {},
    });

    const result = await runSakhiConversation({
      userId: "user-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "Send Alex: See you tomorrow." }],
      channel: "whatsapp",
      channelMessageId: "wamid.send",
      channelReceivedAt: new Date(Date.now() - 2_000),
      sendWhatsAppUpdate,
    }, {
      generate: generate as never,
      checkAccess: vi.fn().mockResolvedValue({
        userData: {},
        availableCredits: 100,
        plan: { creditMultiplier: 1 },
      }) as never,
      deduct: deduct as never,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(exactInput);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      tools: expect.objectContaining({
        gmail_send_email: expect.any(Object),
        WHATSAPP_SEND_PROGRESS_UPDATE: expect.any(Object),
        present_whatsapp_buttons: expect.any(Object),
        present_whatsapp_media: expect.any(Object),
      }),
    }));
    expect(sendWhatsAppUpdate).toHaveBeenCalledWith(
      "*Checking the details before I send this*",
    );
    expect(sendWhatsAppUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
    expect(timingLog).toHaveBeenCalledWith(
      "[whatsapp-ai-timing]",
      expect.objectContaining({
        event: "generateText.started",
        messageId: "wamid.send",
        inboundToGenerateTextMs: expect.any(Number),
        runnerPreparationMs: expect.any(Number),
      }),
    );
    expect(timingLog).toHaveBeenCalledWith(
      "[whatsapp-ai-timing]",
      expect.objectContaining({
        event: "generateText.completed",
        messageId: "wamid.send",
        generateTextDurationMs: expect.any(Number),
        totalRunnerMs: expect.any(Number),
      }),
    );
    for (const stage of [
      "runner.tool.gmail_send_email",
      "runner.close_mcp_clients",
      "runner.calculate_usage_and_credits",
      "runner.deduct_credits",
    ]) {
      expect(timingLog).toHaveBeenCalledWith(
        "[whatsapp-pipeline-timing]",
        expect.objectContaining({
          event: "stage.completed",
          messageId: "wamid.send",
          stage,
          durationMs: expect.any(Number),
        }),
      );
    }
    expect(result.whatsappPresentation).toEqual({
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
      }],
    });
  });

  it("sends one AI progress update per meaningful stage", async () => {
    mocks.createContext.mockResolvedValue({
      system: "You are Sakhi.",
      tools: {},
      mcpClients: [],
    });
    const sendWhatsAppUpdate = vi.fn().mockImplementation(async () => {
      await Promise.resolve();
    });
    const generate = vi.fn().mockImplementation(async ({ tools }) => {
      await Promise.all([
        tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
          stage: "gathering",
          message: "Pulling your Saturday emails now 📬",
        }),
        tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
          stage: "gathering",
          message: "Checking your Saturday inbox now 📬",
        }),
      ]);
      await tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
        stage: "gathering",
        message: "Grabbing those Saturday emails now 📬",
      });
      await tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
        stage: "processing",
        message: "I found 7 emails — summarizing them now.",
      });
      await tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
        stage: "acting",
        message: "Summary’s ready — sending it to your inbox now.",
      });
      await tools.WHATSAPP_SEND_PROGRESS_UPDATE.execute({
        stage: "acting",
        message: "Sending your completed summary now.",
      });
      return {
        text: "Here are your active connections.",
        totalUsage: { inputTokens: 5, outputTokens: 3 },
        steps: [],
      };
    });

    await runSakhiConversation({
      userId: "user-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "Check all my active connections." }],
      channel: "whatsapp",
      channelMessageId: "wamid.connections",
      sendWhatsAppUpdate,
    }, {
      generate: generate as never,
      checkAccess: vi.fn().mockResolvedValue({
        userData: {},
        availableCredits: 100,
        plan: { creditMultiplier: 1 },
      }) as never,
      deduct: vi.fn().mockResolvedValue({
        deductedCredits: 2,
        consumedCredits: 2,
        billing: {},
      }) as never,
    });

    expect(sendWhatsAppUpdate).toHaveBeenCalledTimes(3);
    expect(sendWhatsAppUpdate.mock.calls.map(([message]) => message)).toEqual([
      "Pulling your Saturday emails now 📬",
      "I found 7 emails, summarizing them now",
      "Summary’s ready, sending it to your inbox now",
    ]);
  });

  it("returns web-compatible tool parts while hiding WhatsApp-only tools", async () => {
    mocks.createContext.mockResolvedValue({
      system: "You are Sakhi.",
      tools: {},
      mcpClients: [],
    });
    const generate = vi.fn().mockResolvedValue({
      text: "I found three emails.",
      totalUsage: { inputTokens: 5, outputTokens: 3 },
      steps: [{
        toolCalls: [
          {
            type: "tool-call",
            toolCallId: "call-gmail",
            toolName: "GMAIL_FETCH_EMAILS",
            input: { query: "newer_than:1d" },
          },
          {
            type: "tool-call",
            toolCallId: "call-progress",
            toolName: "WHATSAPP_SEND_PROGRESS_UPDATE",
            input: { stage: "gathering", message: "Checking your inbox" },
          },
        ],
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "call-gmail",
            toolName: "GMAIL_FETCH_EMAILS",
            input: { query: "newer_than:1d" },
            output: {
              progressUpdateRequired: true,
              pendingOperation: "GMAIL_FETCH_EMAILS",
            },
          },
          {
            type: "tool-result",
            toolCallId: "call-progress",
            toolName: "WHATSAPP_SEND_PROGRESS_UPDATE",
            input: { stage: "gathering", message: "Checking your inbox" },
            output: {
              sent: true,
              operations: [{
                toolName: "GMAIL_FETCH_EMAILS",
                result: { messages: [{ subject: "Hello" }] },
              }],
            },
          },
        ],
        content: [],
      }],
    });

    const result = await runSakhiConversation({
      userId: "user-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "Check my emails" }],
      channel: "whatsapp",
      channelMessageId: "wamid.tool-parts",
      sendWhatsAppUpdate: vi.fn(),
    }, {
      generate: generate as never,
      checkAccess: vi.fn().mockResolvedValue({
        userData: {},
        availableCredits: 100,
        plan: { creditMultiplier: 1 },
      }) as never,
      deduct: vi.fn().mockResolvedValue({
        deductedCredits: 2,
        consumedCredits: 2,
        billing: {},
      }) as never,
    });

    expect(result.parts).toEqual([
      expect.objectContaining({
        type: "tool-GMAIL_FETCH_EMAILS",
        toolCallId: "call-gmail",
        state: "output-available",
        input: { query: "newer_than:1d" },
        output: { messages: [{ subject: "Hello" }] },
      }),
      { type: "text", text: "I found three emails." },
    ]);
  });
});
