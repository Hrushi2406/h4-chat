import "server-only";

import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { getDefaultModel, getModelById } from "@/lib/available-models";
import {
  calculateCredits,
  calculateMeteredToolCostNanoUsd,
  usageFromAiSdk,
} from "@/lib/billing/credits";
import {
  BillingAccessError,
  checkTaskAccess,
  deductCredits,
} from "@/lib/billing/server";
import type { IMemory, IUser } from "@/lib/types/user";
import type { WhatsAppPresentation } from "@/lib/whatsapp/types";
import { closeMcpClients } from "@/lib/mcp";
import { recordWhatsAppCreditDeficit } from "@/lib/whatsapp/credit-deficit";
import { normalizeWhatsAppFormatting } from "@/lib/whatsapp/format";
import {
  measureWhatsAppStage,
  measureWhatsAppStageSync,
} from "@/lib/whatsapp/timing";
import {
  createServerConversationContext,
  getConversationProviderOptions,
} from "@/lib/chat/server-conversation-context";
import { createGeneratedAssistantParts } from "@/lib/chat/generated-message-parts";

export interface SakhiConversationInput {
  userId: string;
  threadId: string;
  modelId?: string;
  messages: ModelMessage[];
  channel: "web" | "whatsapp" | "automation";
  channelMessageId?: string;
  channelReceivedAt?: Date;
  signal?: AbortSignal;
  shouldCancel?: () => Promise<boolean>;
  sendWhatsAppUpdate?: (message: string) => void | Promise<void>;
  baseUrl?: string;
  prefetchedAccess?: Promise<Awaited<ReturnType<typeof checkTaskAccess>>>;
}

export interface SakhiConversationResult {
  text: string;
  parts?: UIMessage["parts"];
  modelId: string;
  creditsUsed: number;
  inputTokens: number;
  outputTokens: number;
  whatsappPresentation?: WhatsAppPresentation;
}

type Generator = typeof generateText;

export interface SakhiConversationDependencies {
  generate?: Generator;
  checkAccess?: typeof checkTaskAccess;
  deduct?: typeof deductCredits;
}

export const prefetchSakhiConversationAccess = (input: {
  userId: string;
  modelId?: string;
  channelMessageId?: string;
}) => {
  const modelId = getModelById(input.modelId ?? "")?.id ?? getDefaultModel().id;
  return measureWhatsAppStage(
    input.channelMessageId,
    "runner.check_access",
    () => checkTaskAccess({ userId: input.userId, modelId }),
  );
};

interface PendingToolOperation {
  name: string;
  execute: () => unknown | Promise<unknown>;
}

interface WhatsAppProgressState {
  sentUpdates: Set<string>;
  sentStages: Set<string>;
  announcedTools: Set<string>;
  manualUpdatePending: boolean;
  updateInFlight: boolean;
  pendingOperations: PendingToolOperation[];
}

const WHATSAPP_PROGRESS_TOOL_NAME = "WHATSAPP_SEND_PROGRESS_UPDATE";
const WHATSAPP_PROGRESS_LIMIT = 3;
const WHATSAPP_AI_TIMING_LOG = "[whatsapp-ai-timing]";

const logWhatsAppAiTiming = (
  input: SakhiConversationInput,
  event: "generateText.started" | "generateText.completed" | "generateText.failed",
  timing: Record<string, number | string | undefined>,
) => {
  if (input.channel !== "whatsapp") return;
  console.info(WHATSAPP_AI_TIMING_LOG, {
    event,
    messageId: input.channelMessageId,
    threadId: input.threadId,
    ...timing,
  });
};

const memoryText = (memories: IMemory[] | undefined) =>
  memories?.length
    ? `\nUseful facts the user asked Sakhi to remember:\n${memories
        .map((memory) => `- ${memory.content}`)
        .join("\n")}`
    : "";

const cancellationError = () => {
  const error = new Error("Cancelled");
  error.name = "AbortError";
  return error;
};

const runPendingToolOperations = async (progress: WhatsAppProgressState) => {
  const pending = progress.pendingOperations.splice(0);
  const results: { toolName: string; result?: unknown; error?: string }[] = [];
  for (const operation of pending) {
    progress.announcedTools.add(operation.name);
    try {
      results.push({ toolName: operation.name, result: await operation.execute() });
    } catch (error) {
      results.push({
        toolName: operation.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
};

const sanitizeWhatsAppProgressMessage = (message: string) => {
  const text = normalizeWhatsAppFormatting(message)
    .replace(/[\r\n]+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (
    !text ||
    /\b(system prompt|developer|tool name|schema|api|composio|model|generate|reasoning|we need to)\b/i.test(
      text,
    )
  ) {
    return "";
  }

  const shortened = text.length > 120 ? text.slice(0, 120) : text;
  return shortened.replace(/[.。]+([*_~]?)$/u, "$1").trim();
};

const createWhatsAppPresentationTools = (
  presentation: WhatsAppPresentation,
  sendUpdate: SakhiConversationInput["sendWhatsAppUpdate"],
  progress: WhatsAppProgressState,
): ToolSet => {
  return {
    ...(sendUpdate
      ? {
          [WHATSAPP_PROGRESS_TOOL_NAME]: tool({
            description: "Send a short, casual WhatsApp progress update before a meaningful task stage. Use at most once for each stage: gathering source information, processing it, and acting on the result. Never rephrase an update for the same stage. Never use an em dash or end the message with a period.",
            inputSchema: z.object({
              stage: z.enum(["gathering", "processing", "acting"]).describe(
                "The newly started visible phase: gathering information, processing or summarizing it, or acting by sending/creating/updating.",
              ),
              message: z.string().min(1).max(120).describe(
                "A short, casual, user-facing WhatsApp progress update. No em dashes, trailing period, tool names, or internal reasoning.",
              ),
            }),
            execute: async ({ stage, message }) => {
              const text = sanitizeWhatsAppProgressMessage(message);
              const skipAndContinue = async (reason: string) => ({
                sent: false,
                reason,
                operations: await runPendingToolOperations(progress),
              });
              if (progress.sentUpdates.size >= WHATSAPP_PROGRESS_LIMIT) {
                return skipAndContinue("progress_update_limit_reached");
              }
              if (!text) {
                return { sent: false, reason: "empty_progress_update", operations: [] };
              }
              if (progress.sentStages.has(stage)) {
                return skipAndContinue("progress_stage_already_sent");
              }
              if (progress.sentUpdates.has(text)) {
                return skipAndContinue("duplicate_progress_update");
              }
              if (progress.updateInFlight) {
                return { sent: false, reason: "progress_update_in_flight", operations: [] };
              }

              progress.updateInFlight = true;
              progress.sentUpdates.add(text);
              progress.sentStages.add(stage);
              let sent = false;
              let reason: string | undefined;
              try {
                await sendUpdate(text);
                sent = true;
              } catch {
                progress.sentUpdates.delete(text);
                progress.sentStages.delete(stage);
                reason = "delivery_failed";
              } finally {
                progress.updateInFlight = false;
              }

              const operations = await runPendingToolOperations(progress);
              progress.manualUpdatePending = sent && operations.length === 0;
              return { sent, ...(reason ? { reason } : {}), operations };
            },
          }),
        }
      : {}),
    present_whatsapp_buttons: tool({
      description: "Queue one native WhatsApp reply-button message. Use sparingly when the user needs to choose between 2-3 options or when a genuinely ambiguous or risky action needs confirmation. Do not use it as an extra approval step for a clear request. Put the complete question in body and make every id a self-contained reply that will still make sense when received as the user's next message.",
      inputSchema: z.object({
        body: z.string().min(1).max(1_024),
        buttons: z.array(z.object({
          id: z.string().min(1).max(256),
          title: z.string().min(1).max(20),
        })).min(2).max(3),
      }),
      execute: async ({ body, buttons }) => {
        presentation.buttons = { body, buttons };
        return { queued: true, buttonCount: buttons.length };
      },
    }),
    present_whatsapp_media: tool({
      description: "Queue an image, document, or audio file for native WhatsApp delivery. Use only an HTTPS URL returned by a tool in this conversation. The URL must still be included accurately in the answer as a fallback.",
      inputSchema: z.object({
        url: z.string().url().startsWith("https://"),
        kind: z.enum(["image", "document", "audio"]),
        caption: z.string().min(1).max(1_024).optional(),
        filename: z.string().min(1).max(240).optional(),
      }),
      execute: async (media) => {
        if (presentation.media.length >= 3) {
          return { queued: false, error: "A maximum of three media items can be sent" };
        }
        if (!presentation.media.some((item) => item.url === media.url)) {
          presentation.media.push(media);
        }
        return { queued: true };
      },
    }),
  };
};

const shouldAutoAnnounceTool = (name: string) => {
  const normalized = name.toLowerCase();
  return ![
    "memory",
    "use_helper",
    "prompt_share",
  ].some((quietName) => normalized.includes(quietName));
};

const wrapToolsWithTiming = (
  tools: ToolSet,
  messageId: string | undefined,
): ToolSet => {
  if (!messageId) return tools;
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const executable = definition as typeof definition & {
        execute?: (...args: unknown[]) => unknown;
      };
      if (typeof executable.execute !== "function") return [name, definition];
      const original = executable.execute;
      const stageName = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
      return [name, {
        ...definition,
        execute: (...args: unknown[]) => measureWhatsAppStage(
          messageId,
          `runner.tool.${stageName}`,
          async () => original.apply(definition, args),
        ),
      }];
    }),
  ) as ToolSet;
};

const wrapToolsWithProgressGate = (
  tools: ToolSet,
  input: SakhiConversationInput,
  progress: WhatsAppProgressState,
): ToolSet => {
  const sendUpdate = input.sendWhatsAppUpdate;
  if (!sendUpdate) return tools;
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const executable = definition as typeof definition & {
        execute?: (...args: unknown[]) => unknown;
      };
      if (
        typeof executable.execute !== "function" ||
        !shouldAutoAnnounceTool(name)
      ) return [name, definition];
      const original = executable.execute;
      return [name, {
        ...definition,
        execute: async (...args: unknown[]) => {
          if (
            progress.announcedTools.has(name) ||
            progress.sentUpdates.size >= WHATSAPP_PROGRESS_LIMIT
          ) {
            return original.apply(definition, args);
          }
          if (progress.manualUpdatePending) {
            progress.manualUpdatePending = false;
            progress.announcedTools.add(name);
            return original.apply(definition, args);
          }
          progress.pendingOperations.push({
            name,
            execute: () => original.apply(definition, args),
          });
          return {
            progressUpdateRequired: true,
            pendingOperation: name,
            instruction: `Call ${WHATSAPP_PROGRESS_TOOL_NAME} now. The pending operation will execute immediately after the update is delivered.`,
          };
        },
      }];
    }),
  ) as ToolSet;
};

const wrapToolsWithCancellation = (
  tools: ToolSet,
  shouldCancel: SakhiConversationInput["shouldCancel"],
  messageId: string | undefined,
): ToolSet => {
  if (!shouldCancel) return tools;
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const executable = definition as typeof definition & {
        execute?: (...args: unknown[]) => unknown;
      };
      if (typeof executable.execute !== "function") return [name, definition];
      const original = executable.execute;
      return [name, {
        ...definition,
        execute: async (...args: unknown[]) => {
          if (await measureWhatsAppStage(
            messageId,
            `runner.check_cancellation_before_tool.${name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
            shouldCancel,
          )) throw cancellationError();
          return original.apply(definition, args);
        },
      }];
    }),
  ) as ToolSet;
};

export const runSakhiConversation = async (
  input: SakhiConversationInput,
  dependencies: SakhiConversationDependencies = {},
): Promise<SakhiConversationResult> => {
  const runnerStartedAtMs = Date.now();
  const modelId = getModelById(input.modelId ?? "")?.id ?? getDefaultModel().id;
  const checkAccess = dependencies.checkAccess ?? checkTaskAccess;
  const deduct = dependencies.deduct ?? deductCredits;
  const generate = dependencies.generate ?? generateText;

  const timingMessageId = input.channel === "whatsapp" ? input.channelMessageId : undefined;
  const access = input.prefetchedAccess
    ? await input.prefetchedAccess
    : await measureWhatsAppStage(
        timingMessageId,
        "runner.check_access",
        () => checkAccess({ userId: input.userId, modelId }),
      );
  const user = (access.userData as Partial<IUser> | undefined) ?? {};
  const baseUrl = input.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? process.env.APP_URL ?? "https://trysakhi.com";
  const [context, cancelled] = await Promise.all([
    measureWhatsAppStage(
      timingMessageId,
      "runner.create_context",
      () => createServerConversationContext({
        userId: input.userId,
        threadId: input.threadId,
        modelId,
        baseUrl,
        channel: input.channel,
        channelMessageId: input.channelMessageId,
        user,
      }),
    ),
    measureWhatsAppStage(
      timingMessageId,
      "runner.check_cancellation",
      async () => input.shouldCancel?.(),
    ),
  ]);
  if (cancelled) throw cancellationError();
  const whatsappPresentation: WhatsAppPresentation = { media: [] };
  const whatsappProgress: WhatsAppProgressState = {
    sentUpdates: new Set(),
    sentStages: new Set(),
    announcedTools: new Set(),
    manualUpdatePending: false,
    updateInFlight: false,
    pendingOperations: [],
  };
  const timedContextTools = wrapToolsWithTiming(context.tools, timingMessageId);
  const contextTools = input.channel === "whatsapp"
    ? wrapToolsWithProgressGate(
        timedContextTools,
        input,
        whatsappProgress,
      )
    : timedContextTools;
  const presentationTools = wrapToolsWithTiming(
    createWhatsAppPresentationTools(
      whatsappPresentation,
      input.sendWhatsAppUpdate,
      whatsappProgress,
    ),
    timingMessageId,
  );
  const tools = wrapToolsWithCancellation(
    input.channel === "whatsapp"
      ? {
          ...contextTools,
          ...presentationTools,
        }
      : contextTools,
    input.shouldCancel,
    timingMessageId,
  );
  const result = await (async () => {
    const generateStartedAtMs = Date.now();
    logWhatsAppAiTiming(input, "generateText.started", {
      receivedAt: input.channelReceivedAt?.toISOString(),
      startedAt: new Date(generateStartedAtMs).toISOString(),
      inboundToGenerateTextMs: input.channelReceivedAt
        ? generateStartedAtMs - input.channelReceivedAt.getTime()
        : undefined,
      runnerPreparationMs: generateStartedAtMs - runnerStartedAtMs,
    });
    try {
      const generated = await generate({
        model: modelId,
        system: context.system,
        messages: input.messages,
        tools,
        prepareStep: () =>
          whatsappProgress.pendingOperations.length > 0
            ? {
                activeTools: [WHATSAPP_PROGRESS_TOOL_NAME],
                toolChoice: {
                  type: "tool" as const,
                  toolName: WHATSAPP_PROGRESS_TOOL_NAME,
                },
              }
            : undefined,
        stopWhen: [
          stepCountIs(100),
          ({ steps }) =>
            calculateCredits({
              models: steps.map((step) => usageFromAiSdk(modelId, step.usage)),
              toolCostNanoUsd: calculateMeteredToolCostNanoUsd(
                steps.flatMap((step) =>
                  step.toolCalls.flatMap((call) => (call ? [call.toolName] : [])),
                ),
              ),
              creditMultiplier: access.plan.creditMultiplier,
            }).credits >= access.availableCredits,
        ],
        abortSignal: input.signal,
        ...getConversationProviderOptions(modelId, input.userId),
      });
      const generateCompletedAtMs = Date.now();
      logWhatsAppAiTiming(input, "generateText.completed", {
        completedAt: new Date(generateCompletedAtMs).toISOString(),
        generateTextDurationMs: generateCompletedAtMs - generateStartedAtMs,
        totalRunnerMs: generateCompletedAtMs - runnerStartedAtMs,
      });
      return generated;
    } catch (error) {
      const generateFailedAtMs = Date.now();
      logWhatsAppAiTiming(input, "generateText.failed", {
        failedAt: new Date(generateFailedAtMs).toISOString(),
        generateTextDurationMs: generateFailedAtMs - generateStartedAtMs,
        totalRunnerMs: generateFailedAtMs - runnerStartedAtMs,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    } finally {
      await measureWhatsAppStage(
        timingMessageId,
        "runner.close_mcp_clients",
        () => closeMcpClients(context.mcpClients),
      );
    }
  })();
  const { usage, calculation } = measureWhatsAppStageSync(
    timingMessageId,
    "runner.calculate_usage_and_credits",
    () => {
      const usage = usageFromAiSdk(modelId, result.totalUsage);
      const calculation = calculateCredits({
        models: [usage],
        toolCostNanoUsd: calculateMeteredToolCostNanoUsd(
          result.steps.flatMap((step) =>
            step.toolCalls.flatMap((call) => (call ? [call.toolName] : [])),
          ),
        ),
        creditMultiplier: access.plan.creditMultiplier,
      });
      return { usage, calculation };
    },
  );
  const deduction = await measureWhatsAppStage(
    timingMessageId,
    "runner.deduct_credits",
    () => deduct({
      userId: input.userId,
      calculation,
      ...(input.channel === "whatsapp" && input.channelMessageId
        ? { idempotencyKey: `whatsapp:${input.channelMessageId}:conversation` }
        : {}),
    }),
  );
  if (
    input.channel === "whatsapp" &&
    deduction.deductedCredits < deduction.consumedCredits
  ) {
    await measureWhatsAppStage(
      timingMessageId,
      "runner.record_credit_deficit",
      () => recordWhatsAppCreditDeficit({
        userId: input.userId,
        threadId: input.threadId,
        modelId,
        messageId: input.channelMessageId!,
        consumedCredits: deduction.consumedCredits,
        deductedCredits: deduction.deductedCredits,
      }),
    ).catch((error) => {
      console.error("Failed to record WhatsApp credit deficit", error);
    });
  }
  return {
    text: result.text,
    parts: createGeneratedAssistantParts(result),
    modelId,
    creditsUsed: deduction.deductedCredits,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    ...(input.channel === "whatsapp" &&
    (whatsappPresentation.buttons || whatsappPresentation.media.length > 0)
      ? { whatsappPresentation }
      : {}),
  };
};

export const describeConversationError = (error: unknown): string => {
  if (error instanceof BillingAccessError) {
    switch (error.code) {
      case "INSUFFICIENT_CREDITS":
        return "You’re out of Sakhi credits. Add credits or compare plans, then tap Retry.";
      case "MODEL_NOT_ALLOWED":
        return "Sakhi 1 Pro needs an eligible plan. Use /model to switch to Sakhi 1 or upgrade your plan.";
      default:
        return error.message;
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Cancelled.";
  }
  return "I couldn’t finish that task. Your message is saved, so you can retry it.";
};
