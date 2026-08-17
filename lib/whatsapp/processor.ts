import "server-only";

import type { ModelMessage } from "ai";
import { BillingAccessError } from "@/lib/billing/server";
import {
  describeConversationError,
  runSakhiConversation,
  type SakhiConversationResult,
} from "@/lib/services/sakhi-conversation-runner";
import type { ThreadMessage } from "@/lib/types/thread";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { analyzeWhatsAppMedia } from "@/lib/whatsapp/media-analysis";
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
import { WhatsAppToolApprovalStore } from "@/lib/whatsapp/tool-approval";

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
  analyzeMedia?: typeof analyzeWhatsAppMedia;
  approvalStore?: Pick<WhatsAppToolApprovalStore, "getPending">;
  now?: () => Date;
  baseUrl: string;
}

const toModelMessages = (messages: ThreadMessage[]): ModelMessage[] =>
  messages.slice(-10).flatMap((message) => {
    if ((message.metadata as Record<string, unknown> | undefined)?.progress === true) return [];
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [{ role: message.role, content: message.content } as ModelMessage];
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
    retryPayload: { type: "text", body, replyToMessageId: context.inboundMessageId },
  });
};

const deliverNativeArtifacts = async (
  dependencies: WhatsAppProcessorDependencies,
  to: string,
  text: string,
  threadId: string,
  inboundMessageId: string,
) => {
  const allowedHosts = new Set([
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
  ]);
  const urls = [...text.matchAll(/https?:\/\/[^\s)>\]]+/g)]
    .map((match) => match[0].replace(/[.,]+$/, ""))
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 3);
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname)) continue;
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
      const kind = mimeType.startsWith("image/")
        ? "image"
        : mimeType === "application/pdf" || mimeType.startsWith("text/")
          ? "document"
          : undefined;
      if (!kind) continue;
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_MEDIA_BYTES || !response.body) continue;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let exceeded = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_MEDIA_BYTES) {
          exceeded = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      if (exceeded) continue;
      const combined = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const bytes = combined.buffer;
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
  userId: string,
) => {
  const pendingAction = await (
    dependencies.approvalStore ?? new WhatsAppToolApprovalStore()
  ).getPending(
    userId,
    threadId,
  );
  const asksForConfirmation = Boolean(pendingAction) ||
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
  let confirmationText = text;
  let buttons = [
    { id: "confirm_action", title: "Confirm" },
    { id: "cancel_action", title: "Cancel" },
  ];
  if (pendingAction) {
    const exactDetails = `Exact action awaiting confirmation\n\nTool: ${pendingAction.toolName}\nDetails:\n${JSON.stringify(pendingAction.exactInput, null, 2)}`;
    if (exactDetails.length > 64_000) {
      confirmationText = "This action is too large to display completely on WhatsApp, so it cannot be confirmed safely.";
      buttons = [{ id: "cancel_action", title: "Cancel" }];
    } else {
      for (let offset = 0; offset < exactDetails.length; offset += 3_900) {
        await sendAndRecord(dependencies, to, exactDetails.slice(offset, offset + 3_900), {
          threadId,
          inboundMessageId,
          kind: "confirmation_details",
        });
      }
      confirmationText = `Confirm the complete exact ${pendingAction.toolName} action shown above?`;
    }
  }
  const result = await dependencies.meta.sendButtons(to, confirmationText, buttons);
  await dependencies.store.recordOutbound({
    messageId: result.messageId,
    to,
    threadId,
    inboundMessageId,
    kind: "confirmation",
    retryPayload: { type: "buttons", body: confirmationText, buttons },
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

  if (message.text === "cancel_action") {
    if (account.userId && account.activeThreadId) {
      await new WhatsAppToolApprovalStore().cancel(
        account.userId,
        account.activeThreadId,
      );
    }
    await sendAndRecord(dependencies, message.from, "Action cancelled. Nothing was sent or changed.", {
      inboundMessageId: message.id,
      kind: "confirmation_cancelled",
    });
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
  if (command === "billing_add_credits" || command === "billing_compare_plans") {
    const target = command === "billing_add_credits"
      ? `${baseUrl}/settings?tab=billing&action=recharge`
      : `${baseUrl}/pricing`;
    await sendAndRecord(
      dependencies,
      message.from,
      `${command === "billing_add_credits" ? "Add Sakhi credits" : "Compare Sakhi plans"}: ${target}\n\nAfter updating your credits, return here and tap Retry.`,
      { inboundMessageId: message.id, kind: "billing_link" },
    );
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
  if (command === "retry_delivery") {
    const outbound = await store.getRetryableOutbound(message.from);
    if (!outbound) {
      await sendAndRecord(dependencies, message.from, "There isn’t a retryable delivery available.", {
        inboundMessageId: message.id,
        kind: "delivery_retry_empty",
      });
      return true;
    }
    const sent = outbound.retryPayload.type === "text"
      ? await dependencies.meta.sendText(
          message.from,
          outbound.retryPayload.body,
          outbound.retryPayload.replyToMessageId,
        )
      : await dependencies.meta.sendButtons(
          message.from,
          outbound.retryPayload.body,
          outbound.retryPayload.buttons,
        );
    await store.recordOutbound({
      messageId: sent.messageId,
      to: message.from,
      threadId: outbound.threadId,
      inboundMessageId: outbound.inboundMessageId,
      kind: "delivery_retry",
      retryPayload: outbound.retryPayload,
    });
    await store.updateAccount(message.from, { lastFailedOutboundId: null });
    return true;
  }
  return false;
};

const prepareInbound = async (
  message: WhatsAppInboundMessage,
  account: WhatsAppAccountState,
  dependencies: WhatsAppProcessorDependencies,
  shouldCancel: () => Promise<boolean>,
) => {
  if (message.type === "unsupported") {
    return { content: UNSUPPORTED, terminal: true as const, attachments: [] };
  }
  if (!message.media) {
    return { content: message.text?.trim() || "", terminal: false as const, attachments: [] };
  }
  const media = await dependencies.meta.downloadMedia(message.media.id);
  if (await shouldCancel()) {
    const error = new Error("Cancelled");
    error.name = "AbortError";
    throw error;
  }
  if (
    media.bytes.byteLength > MAX_MEDIA_BYTES ||
    !ALLOWED_MEDIA_TYPES.has(media.mimeType)
  ) {
    throw new Error("This media type or file size isn’t supported by Sakhi.");
  }
  if (
    message.type === "audio" &&
    !media.mimeType.includes("ogg") &&
    !media.mimeType.includes("opus")
  ) {
    throw new Error("Please send voice notes as WhatsApp voice messages (Ogg/Opus) so I can enforce the four-minute limit safely.");
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
  if (await shouldCancel()) {
    const error = new Error("Cancelled");
    error.name = "AbortError";
    throw error;
  }
  if (message.type !== "audio") {
    const analyze = dependencies.analyzeMedia ?? analyzeWhatsAppMedia;
    const mediaAnalysis = await analyze({
      userId: account.userId!,
      attachment,
      messageId: message.id,
      caption: message.text?.trim(),
      shouldCancel,
    });
    return {
      content: [
        message.text?.trim(),
        `[Analysis of ${filename}]\n${mediaAnalysis.text}`,
      ].filter(Boolean).join("\n\n"),
      terminal: false as const,
      attachments: [attachment],
      mediaAnalysis,
    };
  }
  const transcribe = dependencies.transcribe ?? transcribeVoiceNote;
  const transcript = await transcribe(media.bytes, media.mimeType, filename);
  if (await shouldCancel()) {
    const error = new Error("Cancelled");
    error.name = "AbortError";
    throw error;
  }
  await dependencies.store.chargeTranscriptionCredit(account.userId!, message.id);
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
  const immediateCommand = normalizeWhatsAppCommand(message.text);
  if (immediateCommand === "stop" || immediateCommand === "exit") {
    activeControllers.get(message.from)?.abort();
    await store.updateAccount(message.from, {
      optedOut: true,
      ...(immediateCommand === "exit" ? { consent: "declined" } : {}),
    });
    await store.cancelQueuedWork(message.from);
    await sendAndRecord(
      dependencies,
      message.from,
      "You’re opted out of Sakhi WhatsApp messages. Send START whenever you want to return.",
      { inboundMessageId: message.id, kind: "opt_out" },
    );
    await store.finishInbound(message.id, "completed");
    return;
  }
  if (immediateCommand === "cancel") {
    activeControllers.get(message.from)?.abort();
    await store.cancelQueuedWork(message.from);
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
    if (account.lastFailedOutboundId && immediateCommand !== "retry_delivery") {
      const retryable = await store.getRetryableOutbound(message.from);
      if (retryable) {
        const notice = await meta.sendButtons(
          message.from,
          "A previous WhatsApp reply could not be delivered. You can retry that delivery without rerunning the Sakhi task.",
          [{ id: "retry_delivery", title: "Retry delivery" }],
        );
        await store.recordOutbound({
          messageId: notice.messageId,
          to: message.from,
          inboundMessageId: message.id,
          kind: "delivery_retry_offer",
        });
      }
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
    const shouldCancel = () => store.isCancellationRequested(message.from, message.timestamp);
    if (await shouldCancel()) {
      const error = new Error("Cancelled");
      error.name = "AbortError";
      throw error;
    }
    const threadId = await chooseThread(store, account, false, now);
    const prepared = await prepareInbound(message, account, dependencies, shouldCancel);
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
      metadata: {
        whatsappMessageId: message.id,
        ...(prepared.transcript
          ? { transcriptLanguage: prepared.transcript.language, transcriptionCreditsUsed: 1 }
          : {}),
        ...(prepared.mediaAnalysis
          ? {
              mediaAnalysisCreditsUsed: prepared.mediaAnalysis.creditsUsed,
              mediaAnalysisInputTokens: prepared.mediaAnalysis.inputTokens,
              mediaAnalysisOutputTokens: prepared.mediaAnalysis.outputTokens,
            }
          : {}),
      },
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
      await Promise.allSettled([
        store.appendProgress(threadId, event),
        sendAndRecord(dependencies, message.from, event.label, {
          threadId,
          inboundMessageId: message.id,
          kind: "progress",
        }),
        meta.markRead(message.id, true),
      ]);
    };
    const history = await store.getThreadMessages(threadId);
    const runner = dependencies.runConversation ?? runSakhiConversation;
    const controller = new AbortController();
    activeControllers.set(message.from, controller);
    const typingRefresh = setInterval(() => {
      void meta.markRead(message.id, true).catch(() => undefined);
    }, 20_000);
    let cancellationCheckRunning = false;
    const cancellationRefresh = setInterval(() => {
      if (cancellationCheckRunning) return;
      cancellationCheckRunning = true;
      void shouldCancel()
        .then((cancelled) => {
          if (cancelled) controller.abort();
        })
        .catch(() => undefined)
        .finally(() => {
          cancellationCheckRunning = false;
        });
    }, 2_000);
    let result: SakhiConversationResult;
    try {
      result = await runner({
        userId: account.userId,
        threadId,
        modelId: account.modelId,
        messages: toModelMessages(history),
        channel: "whatsapp",
        channelMessageId: message.id,
        onProgress,
        shouldCancel,
        signal: controller.signal,
        baseUrl: dependencies.baseUrl,
      });
    } finally {
      clearInterval(typingRefresh);
      clearInterval(cancellationRefresh);
      activeControllers.delete(message.from);
    }
    if (await shouldCancel()) {
      const error = new Error("Cancelled");
      error.name = "AbortError";
      throw error;
    }
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
      account.userId,
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
      const buttons = error instanceof BillingAccessError && error.code === "INSUFFICIENT_CREDITS"
        ? [
            { id: "billing_add_credits", title: "Add credits" },
            { id: "billing_compare_plans", title: "Compare plans" },
            { id: "retry", title: "Retry" },
          ]
        : [
            { id: "retry", title: "Retry" },
            { id: "new", title: "New chat" },
          ];
      const result = await meta.sendButtons(message.from, description, buttons);
      await store.recordOutbound({
        messageId: result.messageId,
        to: message.from,
        inboundMessageId: message.id,
        kind: "error",
        retryPayload: { type: "buttons", body: description, buttons },
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
