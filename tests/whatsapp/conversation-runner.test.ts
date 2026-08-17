import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
}));

vi.mock("@/lib/chat/server-conversation-context", () => ({
  createServerConversationContext: mocks.createContext,
  getConversationProviderOptions: () => ({}),
}));

import { runSakhiConversation } from "@/lib/services/sakhi-conversation-runner";
import { WhatsAppToolApprovalStore } from "@/lib/whatsapp/tool-approval";

describe("Sakhi WhatsApp conversation runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes a claimed action with the exact stored arguments", async () => {
    const exactInput = {
      to: "alex@example.com",
      subject: "Final plan",
      body: "This exact body must not be regenerated.",
    };
    const execute = vi.fn().mockResolvedValue({ sent: true, messageId: "email-1" });
    mocks.createContext.mockResolvedValue({
      system: "You are Sakhi.",
      tools: { gmail_send_email: { execute } },
      mcpClients: [],
    });
    vi.spyOn(WhatsAppToolApprovalStore.prototype, "finish").mockResolvedValue();
    const generate = vi.fn().mockResolvedValue({
      text: "Email sent.",
      totalUsage: { inputTokens: 5, outputTokens: 3 },
      steps: [],
    });
    const deduct = vi.fn().mockResolvedValue({
      deductedCredits: 2,
      consumedCredits: 2,
      billing: {},
    });

    await runSakhiConversation({
      userId: "user-1",
      threadId: "thread-1",
      messages: [{ role: "user", content: "confirm_action" }],
      channel: "whatsapp",
      channelMessageId: "wamid.confirm",
      approvedAction: { toolName: "gmail_send_email", exactInput },
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
    expect(execute).toHaveBeenCalledWith(exactInput, expect.objectContaining({
      toolCallId: "whatsapp-confirmed-wamid.confirm",
    }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({
        content: expect.stringContaining('"messageId":"email-1"'),
      })],
    }));
  });
});
