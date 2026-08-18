import "server-only";

import type { ModelMessage } from "ai";
import { BillingAccessError } from "@/lib/billing/server";
import { generateChatTitleFromFirstMessage } from "@/lib/services/chat-title-server-service";
import {
  describeConversationError,
  prefetchSakhiConversationAccess,
  runSakhiConversation,
  type SakhiConversationResult,
} from "@/lib/services/sakhi-conversation-runner";
import {
  attachmentsToFileParts,
  getMessageAttachments,
  type Attachment,
  type ThreadMessage,
} from "@/lib/types/thread";
import {
  buildFileUrlContext,
  type UploadedFileRef,
} from "@/lib/chat/file-url-context";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { normalizeWhatsAppFormatting } from "@/lib/whatsapp/format";
import { analyzeWhatsAppMedia } from "@/lib/whatsapp/media-analysis";
import { hashWhatsAppLinkToken, parseWhatsAppLinkCommand } from "@/lib/whatsapp/link";
import {
  normalizeWhatsAppCommand,
  shouldStartNewThread,
} from "@/lib/whatsapp/policy";
import {
  WhatsAppStore,
  type WhatsAppClaimedWork,
} from "@/lib/whatsapp/store";
import {
  measureWhatsAppStage,
  measureWhatsAppStageSync,
} from "@/lib/whatsapp/timing";
import { transcribeVoiceNote } from "@/lib/whatsapp/transcription";
import { chargeWhatsAppTranscription } from "@/lib/whatsapp/transcription-billing";
import type {
  WhatsAppAccountState,
  WhatsAppInboundMessage,
  WhatsAppMediaPresentation,
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
  chargeTranscription?: typeof chargeWhatsAppTranscription;
  analyzeMedia?: typeof analyzeWhatsAppMedia;
  generateTitle?: typeof generateChatTitleFromFirstMessage;
  now?: () => Date;
  baseUrl: string;
}

const threadUploadedFiles = (messages: ThreadMessage[]): UploadedFileRef[] =>
  messages.flatMap((message) =>
    getMessageAttachments(message).flatMap((attachment) =>
      attachment?.url
        ? [{
            url: attachment.url,
            filename: attachment.name,
            mediaType: attachment.contentType,
          }]
        : [],
    ),
  );

const toModelMessages = (messages: ThreadMessage[]): ModelMessage[] => {
  const window = messages.slice(-10);
  const modelMessages = window.flatMap((message) => {
    if ((message.metadata as Record<string, unknown> | undefined)?.progress === true) return [];
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [{ role: message.role, content: message.content } as ModelMessage];
  });
  // Uploads only reach the model as analysis or transcript text, so without the
  // URL registry a follow-up ("mail me that PDF") has no file to work with.
  const fileContext = buildFileUrlContext(threadUploadedFiles(window));
  const last = modelMessages.at(-1);
  if (!fileContext || !last || typeof last.content !== "string") return modelMessages;
  return [
    ...modelMessages.slice(0, -1),
    { ...last, content: `${last.content}\n\n${fileContext}` } as ModelMessage,
  ];
};

const includeCurrentInbound = (
  history: ThreadMessage[],
  message: WhatsAppInboundMessage,
  content: string,
  attachments: Attachment[],
): ThreadMessage[] => {
  const alreadyStored = history.some(
    (candidate) =>
      (candidate.metadata as Record<string, unknown> | undefined)?.whatsappMessageId ===
      message.id,
  );
  if (alreadyStored) return history;
  return [
    ...history,
    {
      id: `whatsapp-${message.id}`,
      role: "user",
      content,
      parts: [
        { type: "text", text: content },
        ...attachmentsToFileParts(attachments),
      ],
      createdAt: message.timestamp,
      updatedAt: message.timestamp.toISOString(),
      experimental_attachments: attachments,
      metadata: { whatsappMessageId: message.id },
    } as ThreadMessage,
  ];
};

const withFinalAnswerText = (
  parts: ThreadMessage["parts"] | undefined,
  answerText: string,
): ThreadMessage["parts"] => {
  if (!parts?.length) return [{ type: "text", text: answerText }];
  const withoutText = parts.filter((part) => part.type !== "text");
  return [...withoutText, { type: "text", text: answerText }];
};

const sendAndRecord = async (
  dependencies: WhatsAppProcessorDependencies,
  to: string,
  body: string,
  context: {
    threadId?: string;
    inboundMessageId?: string;
    kind: string;
    replyToInbound?: boolean;
    afterSend?: () => void;
  },
) => {
  const chunks = body.length > 0
    ? Array.from({ length: Math.ceil(body.length / 3_900) }, (_, index) =>
        body.slice(index * 3_900, (index + 1) * 3_900),
      )
    : [""];
  for (const [index, chunk] of chunks.entries()) {
    const replyToMessageId =
      index === 0 && context.replyToInbound !== false
        ? context.inboundMessageId
        : undefined;
    const result = await measureWhatsAppStage(
      context.inboundMessageId,
      `outbound.send_text.${context.kind}`,
      () => dependencies.meta.sendText(to, chunk, replyToMessageId),
    );
    context.afterSend?.();
    await measureWhatsAppStage(
      context.inboundMessageId,
      `outbound.persist.${context.kind}`,
      () => dependencies.store.recordOutbound({
        messageId: result.messageId,
        to,
        threadId: context.threadId,
        inboundMessageId: context.inboundMessageId,
        kind: context.kind,
        retryPayload: {
          type: "text",
          body: chunk,
          ...(replyToMessageId ? { replyToMessageId } : {}),
        },
      }),
    );
  }
};

const deliverNativeArtifacts = async (
  dependencies: WhatsAppProcessorDependencies,
  to: string,
  text: string,
  threadId: string,
  inboundMessageId: string,
  requestedMedia: WhatsAppMediaPresentation[] = [],
  uploadedUrls: ReadonlySet<string> = new Set(),
) => {
  const allowedHosts = new Set([
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
  ]);
  // The answer can now quote an uploaded file URL, and echoing it back would
  // send the user their own file, so only tool-produced URLs become media.
  const textMedia: WhatsAppMediaPresentation[] = [...text.matchAll(/https?:\/\/[^\s)>\]]+/g)]
    .map((match) => match[0].replace(/[.,]+$/, ""))
    .filter((url, index, all) => all.indexOf(url) === index && !uploadedUrls.has(url))
    .map((url) => ({ url }));
  const media: WhatsAppMediaPresentation[] = [...requestedMedia, ...textMedia]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, 3);
  for (const [index, item] of media.entries()) {
    try {
      const parsed = new URL(item.url);
      if (parsed.protocol !== "https:") continue;
      if (!allowedHosts.has(parsed.hostname)) {
        if (!item.kind) continue;
        const sent = await measureWhatsAppStage(
          inboundMessageId,
          `outbound.send_media_url.${index + 1}.${item.kind}`,
          () => dependencies.meta.sendMediaUrl(to, item.kind!, item.url, {
            ...(item.kind !== "audio" && item.caption ? { caption: item.caption } : {}),
            ...(item.filename ? { filename: item.filename } : {}),
          }),
        );
        await measureWhatsAppStage(
          inboundMessageId,
          `outbound.persist_media.${index + 1}.${item.kind}`,
          () => dependencies.store.recordOutbound({
            messageId: sent.messageId,
            to,
            threadId,
            inboundMessageId,
            kind: `answer_${item.kind}`,
          }),
        );
        continue;
      }
      const response = await measureWhatsAppStage(
        inboundMessageId,
        `outbound.open_artifact.${index + 1}`,
        () => fetch(item.url, {
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        }),
      );
      if (!response.ok) continue;
      const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
      const kind = mimeType.startsWith("image/")
        ? "image"
        : mimeType === "application/pdf" || mimeType.startsWith("text/")
          ? "document"
          : mimeType.startsWith("audio/")
            ? "audio"
          : undefined;
      if (!kind) continue;
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_MEDIA_BYTES || !response.body) continue;
      const { chunks, total, exceeded } = await measureWhatsAppStage(
        inboundMessageId,
        `outbound.read_artifact.${index + 1}`,
        async () => {
          const reader = response.body!.getReader();
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
          return { chunks, total, exceeded };
        }
      );
      if (exceeded) continue;
      const combined = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const bytes = combined.buffer;
      const fallbackFilename =
        parsed.pathname.split("/").pop() ||
        (kind === "image" ? "sakhi-image" : "sakhi-file");
      const filename = item.filename ?? fallbackFilename;
      const mediaId = await measureWhatsAppStage(
        inboundMessageId,
        `outbound.upload_artifact.${index + 1}.${kind}`,
        () => dependencies.meta.uploadMedia(bytes, mimeType, filename),
      );
      const sent = await measureWhatsAppStage(
        inboundMessageId,
        `outbound.send_media.${index + 1}.${kind}`,
        () => dependencies.meta.sendMedia(to, kind, mediaId, {
          ...(kind !== "audio" && item.caption ? { caption: item.caption } : {}),
          filename,
        }),
      );
      await measureWhatsAppStage(
        inboundMessageId,
        `outbound.persist_media.${index + 1}.${kind}`,
        () => dependencies.store.recordOutbound({
          messageId: sent.messageId,
          to,
          threadId,
          inboundMessageId,
          kind: `answer_${kind}`,
        }),
      );
    } catch {
      // The text response already contains the secure link, which is the fallback.
    }
  }
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

const isFirstUserMessage = (history: ThreadMessage[]) =>
  history.filter((entry) => entry.role === "user").length === 1;

/**
 * Names a thread from its first user message, the same way the web chat does, so
 * WhatsApp conversations don't sit in the sidebar as "WhatsApp chat <date>".
 */
const titleThreadFromFirstMessage = async (
  dependencies: WhatsAppProcessorDependencies,
  threadId: string,
  firstMessage: string,
) => {
  const generate = dependencies.generateTitle ?? generateChatTitleFromFirstMessage;
  const title = await generate(firstMessage);
  await dependencies.store.applyGeneratedThreadTitle(threadId, title);
};

const handleCommand = async (
  message: WhatsAppInboundMessage,
  account: WhatsAppAccountState,
  dependencies: WhatsAppProcessorDependencies,
): Promise<boolean> => {
  const command = normalizeWhatsAppCommand(
    message.text,
    message.type === "interactive" ? "interactive" : "text",
  );
  const { store, baseUrl } = dependencies;

  const linkToken = parseWhatsAppLinkCommand(message.text);
  if (linkToken) {
    const result = await measureWhatsAppStage(
      message.id,
      "command.consume_link_intent",
      () => store.consumeLinkIntent(message.from, hashWhatsAppLinkToken(linkToken)),
    );
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
    await measureWhatsAppStage(
      message.id,
      "command.update_model",
      () => store.updateAccount(message.from, { modelId }),
    );
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
    await measureWhatsAppStage(
      message.id,
      "command.update_opt_out",
      () => store.updateAccount(message.from, {
        optedOut: true,
        consent: command === "exit" && account.consent !== "accepted" ? "declined" : account.consent,
        activeMessageId: null,
        pendingMessageIds: [],
      }),
    );
    await sendAndRecord(dependencies, message.from, "You’re opted out of Sakhi WhatsApp messages. Send START whenever you want to return.", {
      inboundMessageId: message.id,
      kind: "opt_out",
    });
    return true;
  }

  if (command === "start") {
    await measureWhatsAppStage(
      message.id,
      "command.update_opt_in",
      () => store.updateAccount(message.from, { optedOut: false }),
    );
    await sendAndRecord(dependencies, message.from, "Welcome back. Send a message whenever you’re ready, your existing Sakhi account and credits are unchanged.", {
      inboundMessageId: message.id,
      kind: "opt_in",
    });
    return true;
  }

  if (account.optedOut) return true;

  if (command === "continue" && account.consent !== "accepted" && !account.requiresWebLink) {
    await measureWhatsAppStage(
      message.id,
      "command.accept_consent",
      () => store.acceptConsent(message.from, message.profileName),
    );
    await sendAndRecord(dependencies, message.from, "Your free Sakhi Account is ready with welcome credits. Send me anything, or tap New chat to start fresh.", {
      inboundMessageId: message.id,
      kind: "welcome",
    });
    return true;
  }

  if (!account.userId || account.consent !== "accepted") return false;

  if (command === "new") {
    const threadId = await measureWhatsAppStage(
      message.id,
      "command.create_thread",
      () => store.createThread(account.userId!, message.from),
    );
    await sendAndRecord(dependencies, message.from, "New chat started. What would you like to do?", {
      threadId,
      inboundMessageId: message.id,
      kind: "new_thread",
    });
    return true;
  }
  if (command === "cancel") {
    await measureWhatsAppStage(
      message.id,
      "command.request_cancellation",
      () => store.updateAccount(message.from, { cancellationRequestedAt: new Date() }),
    );
    await sendAndRecord(dependencies, message.from, "I’ve requested cancellation. Any queued messages will wait until you send them again.", {
      threadId: account.activeThreadId,
      inboundMessageId: message.id,
      kind: "cancel",
    });
    return true;
  }
  if (command === "credits") {
    const credits = await measureWhatsAppStage(
      message.id,
      "command.get_credits",
      () => store.getCredits(account.userId!),
    );
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
    const result = await measureWhatsAppStage(
      message.id,
      "outbound.send_buttons.model_menu",
      () => dependencies.meta.sendButtons(
        message.from,
        `Current model: ${account.modelId.endsWith("pro") ? "Sakhi 1 Pro" : "Sakhi 1"}. Choose a model:`,
        [
          { id: "model_sakhi_1", title: "Sakhi 1" },
          { id: "model_sakhi_1_pro", title: "Sakhi 1 Pro" },
        ],
      ),
    );
    await measureWhatsAppStage(
      message.id,
      "outbound.persist.model_menu",
      () => store.recordOutbound({
        messageId: result.messageId,
        to: message.from,
        inboundMessageId: message.id,
        kind: "model_menu",
      }),
    );
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
    if (!retryId || !(await measureWhatsAppStage(
      message.id,
      "command.reset_inbound_for_retry",
      () => store.resetInboundForRetry(retryId),
    ))) {
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
    await measureWhatsAppStage(
      message.id,
      "command.process_retry",
      () => processWhatsAppMessage(retryId, dependencies),
    );
    return true;
  }
  if (command === "retry_delivery") {
    const outbound = await measureWhatsAppStage(
      message.id,
      "command.get_retryable_outbound",
      () => store.getRetryableOutbound(message.from),
    );
    if (!outbound) {
      await sendAndRecord(dependencies, message.from, "There isn’t a retryable delivery available.", {
        inboundMessageId: message.id,
        kind: "delivery_retry_empty",
      });
      return true;
    }
    const sent = await measureWhatsAppStage(
      message.id,
      "outbound.retry_delivery",
      () => {
        if (outbound.retryPayload.type === "text") {
          return dependencies.meta.sendText(
            message.from,
            outbound.retryPayload.body,
            outbound.retryPayload.replyToMessageId,
          );
        }
        if (outbound.retryPayload.type === "link_button") {
          return dependencies.meta.sendLinkButton(
            message.from,
            outbound.retryPayload.body,
            outbound.retryPayload.displayText,
            outbound.retryPayload.url,
          );
        }
        return dependencies.meta.sendButtons(
          message.from,
          outbound.retryPayload.body,
          outbound.retryPayload.buttons,
        );
      },
    );
    await measureWhatsAppStage(
      message.id,
      "outbound.persist.delivery_retry",
      () => store.recordOutbound({
        messageId: sent.messageId,
        to: message.from,
        threadId: outbound.threadId,
        inboundMessageId: outbound.inboundMessageId,
        kind: "delivery_retry",
        retryPayload: outbound.retryPayload,
      }),
    );
    await measureWhatsAppStage(
      message.id,
      "command.clear_delivery_failure",
      () => store.updateAccount(message.from, {
        lastFailedOutboundId: null,
        deliveryRetryOfferedFor: null,
      }),
    );
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
  const media = await measureWhatsAppStage(
    message.id,
    "processor.download_inbound_media",
    () => dependencies.meta.downloadMedia(message.media!.id),
  );
  if (await measureWhatsAppStage(
    message.id,
    "processor.check_cancellation_after_media_download",
    shouldCancel,
  )) {
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
  const attachment = await measureWhatsAppStage(
    message.id,
    "processor.persist_inbound_media",
    () => dependencies.store.storeMedia({
      userId: account.userId!,
      messageId: message.id,
      bytes: media.bytes,
      mimeType: media.mimeType,
      filename,
    }),
  );
  if (await measureWhatsAppStage(
    message.id,
    "processor.check_cancellation_after_media_persist",
    shouldCancel,
  )) {
    const error = new Error("Cancelled");
    error.name = "AbortError";
    throw error;
  }
  if (!media.mimeType.startsWith("image/") && message.type !== "audio") {
    // Documents go to the conversation the way web sends them: the URL travels
    // in the message and tools read the file. A separate analysis pass also
    // failed the whole message whenever the model could not open the file,
    // which is what a password-protected PDF does.
    return {
      content: [
        message.text?.trim(),
        `[Attached file: ${filename}]`,
      ].filter(Boolean).join("\n\n"),
      terminal: false as const,
      attachments: [attachment],
    };
  }
  if (message.type !== "audio") {
    const analyze = dependencies.analyzeMedia ?? analyzeWhatsAppMedia;
    const mediaAnalysis = await measureWhatsAppStage(
      message.id,
      "processor.analyze_inbound_media",
      () => analyze({
        userId: account.userId!,
        attachment,
        messageId: message.id,
        caption: message.text?.trim(),
        shouldCancel,
      }),
    );
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
  const transcript = await measureWhatsAppStage(
    message.id,
    "processor.transcribe_voice_note",
    () => transcribe(media.bytes, media.mimeType),
  );
  if (await measureWhatsAppStage(
    message.id,
    "processor.check_cancellation_after_transcription",
    shouldCancel,
  )) {
    const error = new Error("Cancelled");
    error.name = "AbortError";
    throw error;
  }
  await measureWhatsAppStage(
    message.id,
    "processor.charge_transcription",
    () => (dependencies.chargeTranscription ?? chargeWhatsAppTranscription)(
      account.userId!,
      message.id,
    ),
  );
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
  preclaimedWork?: WhatsAppClaimedWork,
): Promise<void> => {
  const { store, meta } = dependencies;
  const message = preclaimedWork?.message ?? await measureWhatsAppStage(
      messageId,
      "processor.claim_inbound",
      () => store.claimInbound(messageId),
    );
  if (!message) return;
  const immediateCommand = normalizeWhatsAppCommand(
    message.text,
    message.type === "interactive" ? "interactive" : "text",
  );
  if (!preclaimedWork) {
    void measureWhatsAppStage(
      message.id,
      "processor.mark_read_and_typing.initial",
      () => meta.markRead(message.id, true),
    ).catch(() => undefined);
  }
  if (immediateCommand === "stop" || immediateCommand === "exit") {
    if (immediateCommand === "exit") {
      const currentAccount = await measureWhatsAppStage(
        message.id,
        "processor.load_account_for_exit",
        () => store.getAccount(message.from),
      );
      if (currentAccount.consent === "accepted") {
        await sendAndRecord(
          dependencies,
          message.from,
          "You’re already connected to Sakhi. Nothing changed.",
          { inboundMessageId: message.id, kind: "stale_consent_exit" },
        );
        await measureWhatsAppStage(
          message.id,
          "processor.finish_inbound.stale_exit",
          () => store.finishInbound(message.id, "completed"),
        );
        if (preclaimedWork?.account) {
          await measureWhatsAppStage(
            message.id,
            "processor.release_phone_work.immediate",
            () => store.releasePhoneWork(message.from, message.id),
          );
        }
        return;
      }
    }
    activeControllers.get(message.from)?.abort();
    await measureWhatsAppStage(
      message.id,
      "processor.update_immediate_opt_out",
      () => store.updateAccount(message.from, {
        optedOut: true,
        ...(immediateCommand === "exit" ? { consent: "declined" } : {}),
      }),
    );
    await measureWhatsAppStage(
      message.id,
      "processor.cancel_queued_work.opt_out",
      () => store.cancelQueuedWork(message.from, { releaseActive: true }),
    );
    await sendAndRecord(
      dependencies,
      message.from,
      "You’re opted out of Sakhi WhatsApp messages. Send START whenever you want to return.",
      { inboundMessageId: message.id, kind: "opt_out" },
    );
    await measureWhatsAppStage(
      message.id,
      "processor.finish_inbound.opt_out",
      () => store.finishInbound(message.id, "completed"),
    );
    return;
  }
  if (immediateCommand === "cancel") {
    activeControllers.get(message.from)?.abort();
    await measureWhatsAppStage(
      message.id,
      "processor.cancel_queued_work.cancel",
      () => store.cancelQueuedWork(message.from),
    );
    await sendAndRecord(
      dependencies,
      message.from,
      activeControllers.has(message.from)
        ? "Cancelling the active task."
        : "There isn’t an active task to cancel.",
      { inboundMessageId: message.id, kind: "cancel" },
    );
    await measureWhatsAppStage(
      message.id,
      "processor.finish_inbound.cancel_command",
      () => store.finishInbound(message.id, "completed"),
    );
    if (preclaimedWork?.account) {
      await measureWhatsAppStage(
        message.id,
        "processor.release_phone_work.immediate",
        () => store.releasePhoneWork(message.from, message.id),
      );
    }
    return;
  }
  const account = preclaimedWork
    ? preclaimedWork.account
    : await measureWhatsAppStage(
        message.id,
        "processor.claim_phone_and_load_account",
        () => store.claimPhoneWork(message.from, message.id),
      );
  if (!account) return;

  let nextMessageId: string | undefined;
  let phoneWorkReleased = false;
  try {
    await (async () => {
    if (account.blocked) {
      await measureWhatsAppStage(
        message.id,
        "processor.finish_inbound.blocked",
        () => store.finishInbound(message.id, "completed"),
      );
      return;
    }
    if (account.cooldownUntil && account.cooldownUntil.getTime() > Date.now()) {
      if (!account.cooldownNotifiedAt) {
        await sendAndRecord(
          dependencies,
          message.from,
          "Too many messages came in at once. Sakhi is paused for 5 minutes. I’ll be ready after that.",
          { inboundMessageId: message.id, kind: "cooldown" },
        );
        await measureWhatsAppStage(
          message.id,
          "processor.mark_cooldown_notified",
          () => store.updateAccount(message.from, { cooldownNotifiedAt: new Date() }),
        );
      }
      await measureWhatsAppStage(
        message.id,
        "processor.finish_inbound.cooldown",
        () => store.finishInbound(message.id, "completed"),
      );
      return;
    }
    if (
      account.lastFailedOutboundId &&
      account.deliveryRetryOfferedFor !== account.lastFailedOutboundId &&
      immediateCommand !== "retry_delivery"
    ) {
      const retryable = await measureWhatsAppStage(
        message.id,
        "processor.get_retryable_outbound",
        () => store.getRetryableOutbound(message.from),
      );
      if (retryable) {
        const notice = await measureWhatsAppStage(
          message.id,
          "outbound.send_buttons.delivery_retry_offer",
          () => meta.sendButtons(
            message.from,
            "A previous WhatsApp reply could not be delivered. You can retry that delivery without rerunning the Sakhi task.",
            [{ id: "retry_delivery", title: "Retry delivery" }],
          ),
        );
        await measureWhatsAppStage(
          message.id,
          "outbound.persist.delivery_retry_offer",
          () => store.recordOutbound({
            messageId: notice.messageId,
            to: message.from,
            inboundMessageId: message.id,
            kind: "delivery_retry_offer",
          }),
        );
        await measureWhatsAppStage(
          message.id,
          "processor.mark_delivery_retry_offered",
          () => store.updateAccount(message.from, {
            deliveryRetryOfferedFor: account.lastFailedOutboundId,
          }),
        );
      }
    }
    if (await measureWhatsAppStage(
      message.id,
      "processor.handle_command",
      () => handleCommand(message, account, dependencies),
    )) {
      await measureWhatsAppStage(
        message.id,
        "processor.finish_inbound.command",
        () => store.finishInbound(message.id, "completed"),
      );
      return;
    }
    if (account.optedOut && !account.requiresWebLink) {
      await measureWhatsAppStage(
        message.id,
        "processor.finish_inbound.opted_out",
        () => store.finishInbound(message.id, "completed"),
      );
      return;
    }
    if (!account.userId || account.consent !== "accepted") {
      const now = dependencies.now?.() ?? new Date();
      if (
        account.consentPromptedAt &&
        now.getTime() - account.consentPromptedAt.getTime() < 15 * 60 * 1_000
      ) {
        await measureWhatsAppStage(
          message.id,
          "processor.finish_inbound.consent_recently_prompted",
          () => store.finishInbound(message.id, "completed"),
        );
        return;
      }
      if (account.requiresWebLink) {
        await sendAndRecord(
          dependencies,
          message.from,
          `Reconnect WhatsApp from Sakhi Settings to protect your account: ${dependencies.baseUrl}/settings`,
          { inboundMessageId: message.id, kind: "reconnect_required" },
        );
        await measureWhatsAppStage(
          message.id,
          "processor.mark_reconnect_prompted",
          () => store.updateAccount(message.from, { consentPromptedAt: now }),
        );
        await measureWhatsAppStage(
          message.id,
          "processor.finish_inbound.reconnect_required",
          () => store.finishInbound(message.id, "completed"),
        );
        return;
      }
      const result = await measureWhatsAppStage(
        message.id,
        "outbound.send_buttons.consent",
        () => meta.sendButtons(message.from, CONSENT, [
          { id: "continue", title: "Continue" },
          { id: "exit", title: "Exit" },
        ]),
      );
      await measureWhatsAppStage(
        message.id,
        "outbound.persist.consent",
        () => store.recordOutbound({
          messageId: result.messageId,
          to: message.from,
          inboundMessageId: message.id,
          kind: "consent",
        }),
      );
      await measureWhatsAppStage(
        message.id,
        "processor.mark_consent_prompted",
        () => store.updateAccount(message.from, { consentPromptedAt: now }),
      );
      await measureWhatsAppStage(
        message.id,
        "processor.finish_inbound.consent",
        () => store.finishInbound(message.id, "completed"),
      );
      return;
    }

    const now = dependencies.now?.() ?? new Date();
    const shouldCancel = () => store.isCancellationRequested(
      message.from,
      message.id,
      message.timestamp,
    );
    const reusableThreadId =
      account.activeThreadId &&
      !shouldStartNewThread(account.lastConversationAt, now)
        ? account.activeThreadId
        : undefined;
    const prefetchedAccess = dependencies.runConversation
      ? undefined
      : prefetchSakhiConversationAccess({
          userId: account.userId,
          modelId: account.modelId,
          channelMessageId: message.id,
        });
    void prefetchedAccess?.catch(() => undefined);
    const prefetchedHistoryOutcome = reusableThreadId
      ? measureWhatsAppStage(
          message.id,
          "processor.load_history_for_generation",
          () => store.getThreadMessages(reusableThreadId),
        ).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : undefined;
    if (await measureWhatsAppStage(
      message.id,
      "processor.check_cancellation",
      shouldCancel,
    )) {
      const error = new Error("Cancelled");
      error.name = "AbortError";
      throw error;
    }
    const threadId = await measureWhatsAppStage(
      message.id,
      "processor.resolve_thread",
      () => chooseThread(store, account, false, now),
    );
    const prepared = await measureWhatsAppStage(
      message.id,
      "processor.prepare_inbound",
      () => prepareInbound(message, account, dependencies, shouldCancel),
    );
    if (prepared.terminal) {
      await sendAndRecord(dependencies, message.from, prepared.content, {
        threadId,
        inboundMessageId: message.id,
        kind: "unsupported",
      });
      await measureWhatsAppStage(
        message.id,
        "processor.finish_inbound.unsupported",
        () => store.finishInbound(message.id, "completed"),
      );
      return;
    }
    const storeUserMessage = measureWhatsAppStage(
      message.id,
      "processor.persist_user_message",
      () => store.appendThreadMessage(threadId, "user", prepared.content, {
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
      }),
    );
    const updateAccount = measureWhatsAppStage(
      message.id,
      "processor.update_account",
      () => store.updateAccount(message.from, {
        activeThreadId: threadId,
        lastConversationAt: now,
        lastUnprocessedMessageId: message.id,
      }),
    );
    const persistenceOutcome = Promise.all([storeUserMessage, updateAccount]).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const historyOutcome = prefetchedHistoryOutcome ?? measureWhatsAppStage(
      message.id,
      "processor.load_history_for_generation",
      () => store.getThreadMessages(threadId),
    ).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const storedHistoryOutcome = await historyOutcome;
    if (!storedHistoryOutcome.ok) throw storedHistoryOutcome.error;
    const storedHistory = storedHistoryOutcome.value;
    const history = includeCurrentInbound(storedHistory, message, prepared.content, prepared.attachments);
    if (isFirstUserMessage(history)) {
      // Fire and forget: the title only affects the web sidebar, so it must never
      // hold up the WhatsApp reply.
      void measureWhatsAppStage(
        message.id,
        "processor.generate_thread_title",
        () => titleThreadFromFirstMessage(dependencies, threadId, prepared.content),
      ).catch((error) => {
        console.error("Non-fatal WhatsApp title generation failure", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    const runner = dependencies.runConversation ?? runSakhiConversation;
    const controller = new AbortController();
    activeControllers.set(message.from, controller);
    // WhatsApp's typing indicator is dismissed after 25s or as soon as any message is
    // sent, and re-triggering it too often for the same conversation reads as spam to
    // Meta's delivery pipeline. A fixed-interval timer alongside an immediate restart
    // after every progress update used to fire both within seconds of each other; this
    // shared schedule tracks the last time typing was actually (re)triggered from either
    // source so refreshes stay spaced ~20s apart instead of stacking.
    const TYPING_REFRESH_MS = 20_000;
    let typingRefreshStopped = false;
    let lastTypingTriggerAt = Date.now();
    let typingRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleTypingRefresh = () => {
      if (typingRefreshStopped) return;
      const delay = Math.max(0, TYPING_REFRESH_MS - (Date.now() - lastTypingTriggerAt));
      typingRefreshTimer = setTimeout(() => {
        void measureWhatsAppStage(
          message.id,
          "processor.mark_read_and_typing.refresh",
          () => meta.markRead(message.id, true),
        )
          .catch(() => undefined)
          .finally(() => {
            lastTypingTriggerAt = Date.now();
            scheduleTypingRefresh();
          });
      }, delay);
    };
    scheduleTypingRefresh();
    const restartTypingAfterSend = () => {
      lastTypingTriggerAt = Date.now();
      void measureWhatsAppStage(
        message.id,
        "processor.mark_read_and_typing.after_progress",
        () => meta.markRead(message.id, true),
      ).catch((error) => {
        console.error("Non-fatal WhatsApp typing restart failure", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };
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
      const conversationOutcome = measureWhatsAppStage(
        message.id,
        "processor.run_conversation",
        () => runner({
          userId: account.userId!,
          threadId,
          modelId: account.modelId,
          messages: toModelMessages(history),
          channel: "whatsapp",
          channelMessageId: message.id,
          channelReceivedAt: message.receivedAt,
          shouldCancel,
          sendWhatsAppUpdate: async (update) => {
            await sendAndRecord(dependencies, message.from, update, {
              threadId,
              inboundMessageId: message.id,
              kind: "ai_progress",
              replyToInbound: false,
              afterSend: restartTypingAfterSend,
            });
          },
          signal: controller.signal,
          baseUrl: dependencies.baseUrl,
          prefetchedAccess,
        }),
      ).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const [conversation, persistence] = await Promise.all([
        conversationOutcome,
        persistenceOutcome,
      ]);
      if (!persistence.ok) throw persistence.error;
      if (!conversation.ok) throw conversation.error;
      result = conversation.value;
    } finally {
      typingRefreshStopped = true;
      clearTimeout(typingRefreshTimer);
      clearInterval(cancellationRefresh);
      activeControllers.delete(message.from);
    }
    if (await measureWhatsAppStage(
      message.id,
      "processor.check_cancellation_after_generation",
      shouldCancel,
    )) {
      const error = new Error("Cancelled");
      error.name = "AbortError";
      throw error;
    }
    const answerText = measureWhatsAppStageSync(
      message.id,
      "processor.format_answer",
      () => normalizeWhatsAppFormatting(result.text),
    );
    const persistAssistantMessage = measureWhatsAppStage(
      message.id,
      "processor.persist_assistant_message",
      () => store.appendThreadMessage(threadId, "assistant", answerText, {
        parts: withFinalAnswerText(result.parts, answerText),
        metadata: {
          model: result.modelId,
          creditsUsed: result.creditsUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          ...(result.whatsappPresentation
            ? { whatsappPresentation: result.whatsappPresentation }
            : {}),
        },
      }),
    );
    // WhatsApp interactive messages (buttons, link buttons) carry their own body text
    // and can't be attached to a separately-sent plain-text message, so sending the
    // answer as text and then buttons as a follow-up always reads as two messages.
    // When the answer fits the interactive body limit, fold it into a single button
    // message instead; only fall back to two messages when the answer is too long for
    // an interactive body to hold.
    const MAX_INTERACTIVE_BODY = 1_024;
    const fitsInteractiveBody = answerText.length > 0 && answerText.length <= MAX_INTERACTIVE_BODY;
    const combinedButtons = fitsInteractiveBody ? result.whatsappPresentation?.buttons : undefined;
    const combinedLinkButton = !combinedButtons && fitsInteractiveBody
      ? result.whatsappPresentation?.linkButton
      : undefined;
    const deliverAnswer = (async () => {
      if (combinedButtons) {
        const sent = await measureWhatsAppStage(
          message.id,
          "outbound.send_buttons.answer",
          () => meta.sendButtons(message.from, answerText, combinedButtons.buttons),
        );
        await measureWhatsAppStage(
          message.id,
          "outbound.persist.answer_buttons",
          () => store.recordOutbound({
            messageId: sent.messageId,
            to: message.from,
            threadId,
            inboundMessageId: message.id,
            kind: "answer_buttons",
            retryPayload: { type: "buttons", body: answerText, buttons: combinedButtons.buttons },
          }),
        );
        return;
      }
      if (combinedLinkButton) {
        const sent = await measureWhatsAppStage(
          message.id,
          "outbound.send_link_button.answer",
          () => meta.sendLinkButton(message.from, answerText, combinedLinkButton.displayText, combinedLinkButton.url),
        );
        await measureWhatsAppStage(
          message.id,
          "outbound.persist.answer_link_button",
          () => store.recordOutbound({
            messageId: sent.messageId,
            to: message.from,
            threadId,
            inboundMessageId: message.id,
            kind: "answer_link_button",
            retryPayload: {
              type: "link_button",
              body: answerText,
              displayText: combinedLinkButton.displayText,
              url: combinedLinkButton.url,
            },
          }),
        );
        return;
      }
      await sendAndRecord(dependencies, message.from, answerText, {
        threadId,
        inboundMessageId: message.id,
        kind: "answer",
      });
    })();
    await Promise.all([persistAssistantMessage, deliverAnswer]);
    await measureWhatsAppStage(
      message.id,
      "processor.deliver_native_artifacts",
      () => deliverNativeArtifacts(
        dependencies,
        message.from,
        answerText,
        threadId,
        message.id,
        result.whatsappPresentation?.media,
        new Set(threadUploadedFiles(history).map((file) => file.url)),
      ),
    );
    if (result.whatsappPresentation?.buttons && !combinedButtons) {
      const { body, buttons } = result.whatsappPresentation.buttons;
      const sent = await measureWhatsAppStage(
        message.id,
        "outbound.send_buttons.answer",
        () => meta.sendButtons(message.from, body, buttons),
      );
      await measureWhatsAppStage(
        message.id,
        "outbound.persist.answer_buttons",
        () => store.recordOutbound({
          messageId: sent.messageId,
          to: message.from,
          threadId,
          inboundMessageId: message.id,
          kind: "answer_buttons",
          retryPayload: { type: "buttons", body, buttons },
        }),
      );
    }
    if (result.whatsappPresentation?.linkButton && !combinedLinkButton) {
      const { body, displayText, url } = result.whatsappPresentation.linkButton;
      const sent = await measureWhatsAppStage(
        message.id,
        "outbound.send_link_button.answer",
        () => meta.sendLinkButton(message.from, body, displayText, url),
      );
      await measureWhatsAppStage(
        message.id,
        "outbound.persist.answer_link_button",
        () => store.recordOutbound({
          messageId: sent.messageId,
          to: message.from,
          threadId,
          inboundMessageId: message.id,
          kind: "answer_link_button",
          retryPayload: { type: "link_button", body, displayText, url },
        }),
      );
    }
    const creditWarning = measureWhatsAppStage(
      message.id,
      "processor.get_credit_summary",
      () => store.getCreditSummary(account.userId!),
    ).then(async (creditSummary) => {
      if (creditSummary.ratio > 0.2) return;
      await sendAndRecord(
        dependencies,
        message.from,
        creditSummary.ratio <= 0.05
          ? `Credit alert: only ${creditSummary.available.toLocaleString("en-IN")} credits remain. Add credits: ${dependencies.baseUrl}/settings?tab=billing`
          : `You have ${creditSummary.available.toLocaleString("en-IN")} Sakhi credits left.`,
        { threadId, inboundMessageId: message.id, kind: "credit_warning" },
      );
    }).catch((error) => {
      console.error("Non-fatal WhatsApp credit summary failure", {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    const finishInbound = measureWhatsAppStage(
      message.id,
      "processor.finish_inbound.completed",
      () => store.finishInbound(message.id, "completed"),
    );
    const completePhoneWork = measureWhatsAppStage(
      message.id,
      "processor.complete_phone_work",
      () => store.completePhoneWork(message.from, message.id),
    ).then((next) => {
      phoneWorkReleased = true;
      nextMessageId = next;
    });
    await Promise.all([creditWarning, finishInbound, completePhoneWork]);
    })();
  } catch (error) {
    activeControllers.delete(message.from);
    const description = describeConversationError(error);
    const cancelled = error instanceof Error && error.name === "AbortError";
    await measureWhatsAppStage(
      message.id,
      `processor.finish_inbound.${cancelled ? "cancelled" : "failed"}`,
      () => store.finishInbound(
        message.id,
        cancelled ? "cancelled" : "failed",
        error instanceof Error ? error.message : String(error),
      ),
    );
    await measureWhatsAppStage(
      message.id,
      "processor.remember_unprocessed_message",
      () => store.updateAccount(message.from, { lastUnprocessedMessageId: message.id }),
    );
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
      const result = await measureWhatsAppStage(
        message.id,
        "outbound.send_buttons.error",
        () => meta.sendButtons(message.from, description, buttons),
      );
      await measureWhatsAppStage(
        message.id,
        "outbound.persist.error",
        () => store.recordOutbound({
          messageId: result.messageId,
          to: message.from,
          inboundMessageId: message.id,
          kind: "error",
          retryPayload: { type: "buttons", body: description, buttons },
        }),
      );
    } catch (sendError) {
      console.error("Failed to send WhatsApp processing error", {
        messageId: message.id,
        error: sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  } finally {
    if (!phoneWorkReleased) {
      nextMessageId = await measureWhatsAppStage(
        message.id,
        "processor.release_phone_work",
        () => store.releasePhoneWork(message.from, message.id),
      );
    }
  }

  const queuedMessageId = nextMessageId;
  if (queuedMessageId) {
    await measureWhatsAppStage(
      message.id,
      "processor.process_next_queued_message",
      () => processWhatsAppMessage(queuedMessageId, dependencies),
    );
  }
};
