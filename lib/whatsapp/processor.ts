import "server-only";

import type { ModelMessage } from "ai";
import { BILLING_PLANS } from "@/lib/billing/config";
import { deductCredits } from "@/lib/billing/server";
import {
  describeConversationError,
  runSakhiConversation,
  type SakhiConversationResult,
} from "@/lib/services/sakhi-conversation-runner";
import type { ThreadMessage } from "@/lib/types/thread";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { hashWhatsAppLinkToken, parseWhatsAppLinkCommand } from "@/lib/whatsapp/link";
import {
  normalizeWhatsAppCommand,
  shouldStartNewThread,
} from "@/lib/whatsapp/policy";
import { WhatsAppStore } from "@/lib/whatsapp/store";
import { transcribeVoiceNote } from "@/lib/whatsapp/transcription";
import type {
  WhatsAppAccountState,
  WhatsAppInboundMessage,
  WhatsAppProgressEvent,
} from "@/lib/whatsapp/types";

const UNSUPPORTED =
  "I can currently understand text, images, PDFs, documents, and voice notes up to 4 minutes. Please resend this in one of those formats.";
const CONSENT =
  "Welcome to Sakhi on WhatsApp. If you continue, Sakhi will create or connect your account and process your WhatsApp messages and media under Sakhi’s Privacy Policy. You can send STOP anytime.";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/aac", "audio/flac",
  "application/pdf", "text/csv", "application/csv", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/markdown", "application/json", "application/zip",
]);
const activeControllers = new Map<string, AbortController>();

export interface WhatsAppProcessorDependencies {
  store: WhatsAppStore;
  meta: MetaWhatsAppClient;
  runConversation?: typeof runSakhiConversation;
  transcribe?: typeof transcribeVoiceNote;
  now?: () => Date;
  baseUrl: string;
}

const toModelMessages = (messages: ThreadMessage[]): ModelMessage[] =>
  messages.slice(-10).flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const files = message.experimental_attachments ?? [];
    if (message.role === "assistant" || files.length === 0) {
      return [{ role: message.role, content: message.content } as ModelMessage];
    }
    return [{
      role: "user",
      content: [
        { type: "text", text: message.content || "Please inspect the attached file." },
        ...files.map((file) => ({
          type: "file" as const,
          data: new URL(file.url),
          mediaType: file.contentType ?? "application/octet-stream",
          filename: file.name,
        })),
      ],
    } as ModelMessage];
  });

const sendAndRecord = async (
  dependencies: WhatsAppProcessorDependencies,
  to: string,
  body: string,
  context: { threadId?: string; inboundMessageId?: string; kind: string },
) => {
  const result = await dependencies.meta.sendText(to, body, context.inboundMessageId);
  await dependencies.store.recordOutbound({
    messageId: result.messageId,
    to,
    threadId: context.threadId,
    inboundMessageId: context.inboundMessageId,
    kind: context.kind,
  });
};

const deliverNativeArtifacts = async (
  dependencies: WhatsAppProcessorDependencies,
  to: string,
  text: string,
  threadId: string,
  inboundMessageId: string,
) => {
  const urls = [...text.matchAll(/https?:\/\/[^\s)>\]]+/g)]
    .map((match) => match[0].replace(/[.,]+$/, ""))
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 3);
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) continue;
      const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
      const kind = mimeType.startsWith("image/")
        ? "image"
        : mimeType === "application/pdf" || mimeType.startsWith("text/")
          ? "document"
          : undefined;
      if (!kind) continue;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 25 * 1024 * 1024) continue;
      const filename = new URL(url).pathname.split("/").pop() || (kind === "image" ? "sakhi-image" : "sakhi-file");
      const mediaId = await dependencies.meta.uploadMedia(bytes, mimeType, filename);
      const sent = await dependencies.meta.sendMedia(to, kind, mediaId, { filename });
      await dependencies.store.recordOutbound({
        messageId: sent.messageId,
        to,
        threadId,
        inboundMessageId,
        kind: `answer_${kind}`,
      });
    } catch {
      // The text response already contains the secure link, which is the fallback.
    }
  }
};

const sendConversationAnswer = async (
  dependencies: WhatsAppProcessorDependencies,
  to: string,
  text: string,
  threadId: string,
  inboundMessageId: string,
) => {
  const asksForConfirmation =
    /(?:please|tap|reply|would you like me to|shall i).{0,80}(?:confirm|send|delete|publish|proceed)/i.test(text) ||
    /confirm(?:ation)? required/i.test(text);
  if (!asksForConfirmation) {
    await sendAndRecord(dependencies, to, text, {
      threadId,
      inboundMessageId,
      kind: "answer",
    });
    return;
  }
  const result = await dependencies.meta.sendButtons(to, text, [
    { id: "confirm_action", title: "Confirm" },
    { id: "cancel_action", title: "Cancel" },
  ]);
  await dependencies.store.recordOutbound({
    messageId: result.messageId,
    to,
    threadId,
    inboundMessageId,
    kind: "confirmation",
  });
};

const chooseThread = async (
  store: WhatsAppStore,
  account: WhatsAppAccountState,
  forceNew: boolean,
  now: Date,
) => {
  if (
    forceNew ||
    !account.activeThreadId ||
    shouldStartNewThread(account.lastConversationAt, now)
  ) {
    return store.createThread(account.userId!, account.phoneNumber);
  }
  return account.activeThreadId;
};

const handleCommand = async (
  message: WhatsAppInboundMessage,
  account: WhatsAppAccountState,
  dependencies: WhatsAppProcessorDependencies,
): Promise<boolean> => {
  const command = normalizeWhatsAppCommand(message.text);
  const { store, baseUrl } = dependencies;

  const linkToken = parseWhatsAppLinkCommand(message.text);
  if (linkToken) {
    const result = await store.consumeLinkIntent(message.from, hashWhatsAppLinkToken(linkToken));
    const response =
      result.status === "connected" || result.status === "merged"
        ? result.status === "merged"
          ? "WhatsApp is connected and your Sakhi history has been merged into your web account."
          : "WhatsApp is connected to your Sakhi web account."
        : result.status === "conflict"
          ? "I found two established Sakhi accounts and won’t merge them automatically. Email support@trysakhi.com for a safe merge."
          : "That connection link is invalid, expired, or already used. Create a new one in Sakhi Settings.";
    await sendAndRecord(dependencies, message.from, response, {
      inboundMessageId: message.id,
      kind: "account_link",
    });
    return true;
  }

  if (message.text === "model_sakhi_1" || message.text === "model_sakhi_1_pro") {
    const modelId = message.text === "model_sakhi_1_pro"
      ? "deepseek/deepseek-v4-pro"
      : "deepseek/deepseek-v4-flash";
    await store.updateAccount(message.from, { modelId });
    await sendAndRecord(
      dependencies,
      message.from,
      `Model set to ${message.text === "model_sakhi_1_pro" ? "Sakhi 1 Pro" : "Sakhi 1"}.`,
      { inboundMessageId: message.id, kind: "model" },
    );
    return true;
  }

  if (!command) return false;

  if (command === "stop" || command === "exit") {
    await store.updateAccount(message.from, {
      optedOut: true,
      consent: command === "exit" && account.consent !== "accepted" ? "declined" : account.consent,
      activeMessageId: null,
      pendingMessageIds: [],
    });
    await sendAndRecord(dependencies, message.from, "You’re opted out of Sakhi WhatsApp messages. Send START whenever you want to return.", {
      inboundMessageId: message.id,
      kind: "opt_out",
    });
    return true;
  }

  if (command === "start") {
    await store.updateAccount(message.from, { optedOut: false });
    await sendAndRecord(dependencies, message.from, "Welcome back. Send a message whenever you’re ready — your existing Sakhi account and credits are unchanged.", {
      inboundMessageId: message.id,
      kind: "opt_in",
    });
    return true;
  }

  if (account.optedOut) return true;

  if (command === "continue" && account.consent !== "accepted") {
    await store.acceptConsent(message.from, message.profileName);
    await sendAndRecord(dependencies, message.from, "Your free Sakhi Account is ready with welcome credits. Send me anything, or tap New chat to start fresh.", {
      inboundMessageId: message.id,
      kind: "welcome",
    });
    return true;
  }

  if (!account.userId || account.consent !== "accepted") return false;

  if (command === "new") {
    const threadId = await store.createThread(account.userId, message.from);
    await sendAndRecord(dependencies, message.from, "New chat started. What would you like to do?", {
      threadId,
      inboundMessageId: message.id,
      kind: "new_thread",
    });
    return true;
  }
  if (command === "cancel") {
    await store.updateAccount(message.from, { cancellationRequestedAt: new Date() });
    await sendAndRecord(dependencies, message.from, "I’ve requested cancellation. Any queued messages will wait until you send them again.", {
      threadId: account.activeThreadId,
      inboundMessageId: message.id,
      kind: "cancel",
    });
    return true;
  }
  if (command === "credits") {
    const credits = await store.getCredits(account.userId);
    await sendAndRecord(dependencies, message.from, `You have ${credits.toLocaleString("en-IN")} Sakhi credits. Manage credits: ${baseUrl}/settings?tab=billing`, {
      inboundMessageId: message.id,
      kind: "credits",
    });
    return true;
  }
  if (command === "model") {
    const result = await dependencies.meta.sendButtons(
      message.from,
      `Current model: ${account.modelId.endsWith("pro") ? "Sakhi 1 Pro" : "Sakhi 1"}. Choose a model:`,
      [
        { id: "model_sakhi_1", title: "Sakhi 1" },
        { id: "model_sakhi_1_pro", title: "Sakhi 1 Pro" },
      ],
    );
    await store.recordOutbound({
      messageId: result.messageId,
      to: message.from,
      inboundMessageId: message.id,
      kind: "model_menu",
    });
    return true;
  }
  if (command === "support") {
    const supportId = `WA-${message.from.slice(-4)}-${message.id.slice(-6)}`;
    await sendAndRecord(dependencies, message.from, `Email support@trysakhi.com and include support ID ${supportId}. We don’t currently offer live-agent handoff on WhatsApp.`, {
      inboundMessageId: message.id,
      kind: "support",
    });
    return true;
  }
  if (command === "retry") {
    const retryId = account.lastUnprocessedMessageId;
    if (!retryId || !(await store.resetInboundForRetry(retryId))) {
      await sendAndRecord(dependencies, message.from, "There isn’t a failed message available to retry.", {
        inboundMessageId: message.id,
        kind: "retry_empty",
      });
      return true;
    }
    await sendAndRecord(dependencies, message.from, "Retrying your last unfinished message now.", {
      inboundMessageId: message.id,
      kind: "retry",
    });
    await processWhatsAppMessage(retryId, dependencies);
    return true;
  }
  return false;
};

const prepareInbound = async (
  message: WhatsAppInboundMessage,
  account: WhatsAppAccountState,
  dependencies: WhatsAppProcessorDependencies,
) => {
  if (message.type === "unsupported") {
    return { content: UNSUPPORTED, terminal: true as const, attachments: [] };
  }
  if (!message.media) {
    return { content: message.text?.trim() || "", terminal: false as const, attachments: [] };
  }
  const media = await dependencies.meta.downloadMedia(message.media.id);
  if (
    media.bytes.byteLength > MAX_MEDIA_BYTES ||
    !ALLOWED_MEDIA_TYPES.has(media.mimeType)
  ) {
    throw new Error("This media type or file size isn’t supported by Sakhi.");
  }
  const extension = media.mimeType.split("/")[1]?.split(";")[0] || "bin";
  const filename = message.media.filename || `${message.type}-${message.id}.${extension}`;
  const attachment = await dependencies.store.storeMedia({
    userId: account.userId!,
    messageId: message.id,
    bytes: media.bytes,
    mimeType: media.mimeType,
    filename,
  });
  if (message.type !== "audio") {
    return {
      content: message.text?.trim() || `Please inspect ${filename}.`,
      terminal: false as const,
      attachments: [attachment],
    };
  }
  const transcribe = dependencies.transcribe ?? transcribeVoiceNote;
  const transcript = await transcribe(media.bytes, media.mimeType, filename);
  if (await dependencies.store.markTranscriptionCharged(message.id)) {
    await deductCredits({
      userId: account.userId!,
      calculation: {
        credits: 1,
        modelCostNanoUsd: 0,
        toolCostNanoUsd: 0,
        totalCostNanoUsd: 0,
        creditMultiplier: BILLING_PLANS.free.creditMultiplier,
        formulaVersion: 1,
        rateVersion: 1,
      },
    });
  }
  return {
    content: transcript.text,
    terminal: false as const,
    attachments: [attachment],
    transcript,
  };
};

export const processWhatsAppMessage = async (
  messageId: string,
  dependencies: WhatsAppProcessorDependencies,
): Promise<void> => {
  const { store, meta } = dependencies;
  const message = await store.claimInbound(messageId);
  if (!message) return;
  if (normalizeWhatsAppCommand(message.text) === "cancel") {
    activeControllers.get(message.from)?.abort();
    await store.updateAccount(message.from, {
      cancellationRequestedAt: new Date(),
      pendingMessageIds: [],
    });
    await sendAndRecord(
      dependencies,
      message.from,
      activeControllers.has(message.from)
        ? "Cancelling the active task."
        : "There isn’t an active task to cancel.",
      { inboundMessageId: message.id, kind: "cancel" },
    );
    await store.finishInbound(message.id, "completed");
    return;
  }
  const claimedPhone = await store.claimPhoneWork(message.from, message.id);
  if (!claimedPhone) return;

  let nextMessageId: string | undefined;
  try {
    await (async () => {
    const account = await store.getAccount(message.from);
    if (account.blocked) {
      await store.finishInbound(message.id, "completed");
      return;
    }
    if (await handleCommand(message, account, dependencies)) {
      await store.finishInbound(message.id, "completed");
      return;
    }
    if (account.cooldownUntil && account.cooldownUntil.getTime() > Date.now()) {
      await sendAndRecord(
        dependencies,
        message.from,
        "Sakhi is temporarily paused for this number because too many messages arrived at once. Please try again in a few minutes.",
        { inboundMessageId: message.id, kind: "cooldown" },
      );
      await store.finishInbound(message.id, "completed");
      return;
    }
    if (account.optedOut) {
      await store.finishInbound(message.id, "completed");
      return;
    }
    if (!account.userId || account.consent !== "accepted") {
      const result = await meta.sendButtons(message.from, CONSENT, [
        { id: "continue", title: "Continue" },
        { id: "exit", title: "Exit" },
      ]);
      await store.recordOutbound({
        messageId: result.messageId,
        to: message.from,
        inboundMessageId: message.id,
        kind: "consent",
      });
      await store.finishInbound(message.id, "completed");
      return;
    }

    await meta.markRead(message.id, true);
    const now = dependencies.now?.() ?? new Date();
    const threadId = await chooseThread(store, account, false, now);
    const prepared = await prepareInbound(message, account, dependencies);
    if (prepared.terminal) {
      await sendAndRecord(dependencies, message.from, prepared.content, {
        threadId,
        inboundMessageId: message.id,
        kind: "unsupported",
      });
      await store.finishInbound(message.id, "completed");
      return;
    }
    await store.appendThreadMessage(threadId, "user", prepared.content, {
      attachments: prepared.attachments,
      metadata: prepared.transcript
        ? { transcriptLanguage: prepared.transcript.language, transcriptionCreditsUsed: 1 }
        : undefined,
    });
    await store.updateAccount(message.from, {
      activeThreadId: threadId,
      lastConversationAt: now,
      lastUnprocessedMessageId: message.id,
    });

    let lastProgressAt = 0;
    const onProgress = async (event: WhatsAppProgressEvent) => {
      if (event.kind === "accepted" || event.label === "Done") return;
      const timestamp = Date.now();
      if (
        timestamp - lastProgressAt < 3_000 &&
        !["completed", "confirmation", "failed", "cancelled"].includes(event.kind)
      ) return;
      lastProgressAt = timestamp;
      await store.appendProgress(threadId, event);
      await sendAndRecord(dependencies, message.from, event.label, {
        threadId,
        inboundMessageId: message.id,
        kind: "progress",
      });
    };
    const history = await store.getThreadMessages(threadId);
    const runner = dependencies.runConversation ?? runSakhiConversation;
    const controller = new AbortController();
    activeControllers.set(message.from, controller);
    const result: SakhiConversationResult = await runner({
      userId: account.userId,
      threadId,
      modelId: account.modelId,
      messages: toModelMessages(history),
      channel: "whatsapp",
      onProgress,
      signal: controller.signal,
      baseUrl: dependencies.baseUrl,
    });
    activeControllers.delete(message.from);
    await store.appendThreadMessage(threadId, "assistant", result.text, {
      metadata: {
        model: result.modelId,
        creditsUsed: result.creditsUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
    await sendConversationAnswer(
      dependencies,
      message.from,
      result.text,
      threadId,
      message.id,
    );
    await deliverNativeArtifacts(
      dependencies,
      message.from,
      result.text,
      threadId,
      message.id,
    );
    const creditSummary = await store.getCreditSummary(account.userId);
    if (creditSummary.ratio <= 0.2) {
      await sendAndRecord(
        dependencies,
        message.from,
        creditSummary.ratio <= 0.05
          ? `Credit alert: only ${creditSummary.available.toLocaleString("en-IN")} credits remain. Add credits: ${dependencies.baseUrl}/settings?tab=billing`
          : `You have ${creditSummary.available.toLocaleString("en-IN")} Sakhi credits left.`,
        { threadId, inboundMessageId: message.id, kind: "credit_warning" },
      );
    }
    await store.updateAccount(message.from, { lastUnprocessedMessageId: null });
    await store.finishInbound(message.id, "completed");
    })();
  } catch (error) {
    activeControllers.delete(message.from);
    const description = describeConversationError(error);
    const cancelled = error instanceof Error && error.name === "AbortError";
    await store.finishInbound(
      message.id,
      cancelled ? "cancelled" : "failed",
      error instanceof Error ? error.message : String(error),
    );
    await store.updateAccount(message.from, { lastUnprocessedMessageId: message.id });
    try {
      const result = await meta.sendButtons(message.from, description, [
        { id: "retry", title: "Retry" },
        { id: "new", title: "New chat" },
      ]);
      await store.recordOutbound({
        messageId: result.messageId,
        to: message.from,
        inboundMessageId: message.id,
        kind: "error",
      });
    } catch (sendError) {
      console.error("Failed to send WhatsApp processing error", {
        messageId: message.id,
        error: sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  } finally {
    nextMessageId = await store.releasePhoneWork(message.from, message.id);
  }

  if (nextMessageId) {
    await processWhatsAppMessage(nextMessageId, dependencies);
  }
};
