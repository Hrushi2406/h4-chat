import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getComposioSessionTools: vi.fn(),
  createMcpToolContext: vi.fn(),
  getUserMcpServersFromFirestore: vi.fn(),
  getAvailableHelpers: vi.fn(),
}));

vi.mock("@/lib/composio", () => ({
  isComposioConfigured: () => true,
  getComposioSessionTools: mocks.getComposioSessionTools,
}));
vi.mock("@/lib/mcp", () => ({
  createMcpToolContext: mocks.createMcpToolContext,
}));
vi.mock("@/lib/mcp-firestore", () => ({
  getUserMcpServersFromFirestore: mocks.getUserMcpServersFromFirestore,
}));
vi.mock("@/lib/services/helper-server-service", () => ({
  default: {
    getAvailableHelpers: mocks.getAvailableHelpers,
    recordUsage: vi.fn(),
  },
}));

import { createServerConversationContext } from "@/lib/chat/server-conversation-context";

describe("WhatsApp server conversation context", () => {
  it("starts MCP initialization without waiting for Composio", async () => {
    let releaseComposio: ((tools: Record<string, never>) => void) | undefined;
    mocks.getComposioSessionTools.mockImplementation(
      () => new Promise<Record<string, never>>((resolve) => {
        releaseComposio = resolve;
      }),
    );
    mocks.getAvailableHelpers.mockResolvedValue([]);
    mocks.getUserMcpServersFromFirestore.mockResolvedValue([]);
    mocks.createMcpToolContext.mockResolvedValue(undefined);

    const contextPromise = createServerConversationContext({
      userId: "user-1",
      threadId: "thread-1",
      modelId: "deepseek/deepseek-v4-flash",
      baseUrl: "https://trysakhi.com",
      channel: "whatsapp",
      user: {},
    });

    await vi.waitFor(() => {
      expect(mocks.getUserMcpServersFromFirestore).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    await Promise.resolve();
    const mcpStartedBeforeComposioFinished =
      mocks.createMcpToolContext.mock.calls.length === 1;
    releaseComposio?.({});
    const context = await contextPromise;

    expect(mcpStartedBeforeComposioFinished).toBe(true);
    expect(context.system).toContain("Never use em dashes in any WhatsApp message");
    expect(context.system).toContain("Never end a progress update with a period");
    expect(context.system).toContain("very short, casual, conversational");
  });
});
