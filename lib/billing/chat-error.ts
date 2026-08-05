const BILLING_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDITS:
    "You’re out of credits. [Buy more credits](/pricing#recharge) or [view plans](/pricing) to keep chatting.",
  MODEL_NOT_ALLOWED:
    "This model isn’t included in your current plan. [View plans](/pricing) to upgrade, or choose another model.",
  SUBSCRIPTION_INACTIVE:
    "Your paid access has ended. [Manage billing](/settings?tab=billing) or [view plans](/pricing) to continue.",
  MODEL_RATE_MISSING:
    "That model is temporarily unavailable. Please choose another model and try again.",
};

export type ParsedChatApiError = {
  message: string;
  code?: string;
  billingCode?: string;
  fallbackModelId?: string;
};

export const parseChatApiError = (
  rawMessage: string,
): ParsedChatApiError => {
  try {
    const parsed = JSON.parse(rawMessage) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { message: rawMessage };
    }

    const response = parsed as {
      error?: unknown;
      code?: unknown;
      fallbackModelId?: unknown;
      fallbackModelName?: unknown;
    };
    const code = typeof response.code === "string" ? response.code : undefined;
    const friendlyMessage = code ? BILLING_ERROR_MESSAGES[code] : undefined;

    if (friendlyMessage) {
      return { message: friendlyMessage, code, billingCode: code };
    }

    if (code === "INVALID_MODEL") {
      const fallbackName =
        typeof response.fallbackModelName === "string"
          ? response.fallbackModelName
          : "the default model";
      return {
        message: `That model is no longer available. I switched you to **${fallbackName}**. Please send your message again.`,
        code,
        fallbackModelId:
          typeof response.fallbackModelId === "string"
            ? response.fallbackModelId
            : undefined,
      };
    }

    if (typeof response.error === "string" && response.error.trim()) {
      return { message: response.error.trim() };
    }
  } catch {
    // Non-JSON errors already contain the most useful message available.
  }

  return { message: rawMessage };
};
