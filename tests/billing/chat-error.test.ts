import { describe, expect, it } from "vitest";
import { parseChatApiError } from "@/lib/billing/chat-error";

describe("chat billing errors", () => {
  it("turns insufficient-credit JSON into an actionable message", () => {
    const result = parseChatApiError(
      JSON.stringify({
        error: "You have used all your credits for this month.",
        code: "INSUFFICIENT_CREDITS",
      }),
    );

    expect(result).toMatchObject({
      code: "INSUFFICIENT_CREDITS",
      billingCode: "INSUFFICIENT_CREDITS",
    });
    expect(result.message).toContain("Buy more credits");
    expect(result.message).toContain("/pricing#recharge");
    expect(result.message).not.toContain("INSUFFICIENT_CREDITS");
  });

  it("provides a plan action for model-access errors", () => {
    const result = parseChatApiError(
      JSON.stringify({
        error: "Upgrade your plan to use this model.",
        code: "MODEL_NOT_ALLOWED",
      }),
    );

    expect(result.billingCode).toBe("MODEL_NOT_ALLOWED");
    expect(result.message).toContain("[View plans](/pricing)");
  });

  it("extracts readable messages from unknown structured errors", () => {
    expect(
      parseChatApiError(
        JSON.stringify({ error: "Something specific went wrong." }),
      ),
    ).toEqual({ message: "Something specific went wrong." });
  });

  it("turns stale-model errors into a model-switch prompt", () => {
    const result = parseChatApiError(
      JSON.stringify({
        error: "The selected model is no longer available.",
        code: "INVALID_MODEL",
        fallbackModelId: "deepseek/deepseek-v4-flash",
        fallbackModelName: "Sakhi 1",
      }),
    );

    expect(result).toEqual({
      code: "INVALID_MODEL",
      fallbackModelId: "deepseek/deepseek-v4-flash",
      message:
        "That model is no longer available. I switched you to **Sakhi 1**. Please send your message again.",
    });
  });

  it("preserves ordinary non-JSON errors", () => {
    expect(parseChatApiError("Network connection failed.")).toEqual({
      message: "Network connection failed.",
    });
  });
});
