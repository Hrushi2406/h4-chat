import { describe, expect, it } from "vitest";
import {
  serializeThreadMessageForFirestore,
  type ThreadMessage,
} from "@/lib/types/thread";

describe("credit-limit notice persistence", () => {
  it("preserves fallback content and notice metadata for reloads", () => {
    const message: ThreadMessage = {
      id: "credit-limit-message",
      role: "assistant",
      content: "Credit limit reached",
      parts: [{ type: "text", text: "Credit limit reached" }],
      updatedAt: "2026-07-30T07:15:00.000Z",
      metadata: {
        creditLimitReached: true,
        creditLimitNotice: "credits_exhausted",
      },
    };

    const stored = serializeThreadMessageForFirestore(message);

    expect(stored.content).toBe("Credit limit reached");
    expect(stored.metadata).toMatchObject({
      creditLimitReached: true,
      creditLimitNotice: "credits_exhausted",
    });
  });
});
