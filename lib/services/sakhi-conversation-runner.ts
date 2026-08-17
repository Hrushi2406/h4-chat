import "server-only";

import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
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
import type { WhatsAppProgressEvent } from "@/lib/whatsapp/types";
import { getWhatsAppToolProgress } from "@/lib/whatsapp/progress";
import {
  isConsequentialWhatsAppTool,
  WhatsAppToolApprovalStore,
} from "@/lib/whatsapp/tool-approval";
import { closeMcpClients } from "@/lib/mcp";
import { recordWhatsAppCreditDeficit } from "@/lib/whatsapp/credit-deficit";
import {
  createServerConversationContext,
  getConversationProviderOptions,
} from "@/lib/chat/server-conversation-context";

export interface SakhiConversationInput {
  userId: string;
  threadId: string;
  modelId?: string;
  messages: ModelMessage[];
  channel: "web" | "whatsapp" | "automation";
  channelMessageId?: string;
  signal?: AbortSignal;
  onProgress?: (event: WhatsAppProgressEvent) => void | Promise<void>;
  shouldCancel?: () => Promise<boolean>;
  baseUrl?: string;
  approvedAction?: { toolName: string; exactInput: unknown };
}

export interface SakhiConversationResult {
  text: string;
  modelId: string;
  creditsUsed: number;
  inputTokens: number;
  outputTokens: number;
}

type Generator = typeof generateText;

export interface SakhiConversationDependencies {
  generate?: Generator;
  checkAccess?: typeof checkTaskAccess;
  deduct?: typeof deductCredits;
}

const memoryText = (memories: IMemory[] | undefined) =>
  memories?.length
    ? `\nUseful facts the user asked Sakhi to remember:\n${memories
        .map((memory) => `- ${memory.content}`)
        .join("\n")}`
    : "";

const wrapToolsWithProgress = (
  tools: ToolSet,
  onProgress: SakhiConversationInput["onProgress"],
): ToolSet => {
  if (!onProgress) return tools;
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const executable = definition as typeof definition & {
        execute?: (...args: unknown[]) => unknown;
      };
      if (typeof executable.execute !== "function") return [name, definition];
      const original = executable.execute;
      const progress = getWhatsAppToolProgress(name);
      if (!progress) return [name, definition];
      return [
        name,
        {
          ...definition,
          execute: async (...args: unknown[]) => {
            const [started, completed] = progress;
            await onProgress(started);
            const output = await original.apply(definition, args);
            await onProgress(completed);
            return output;
          },
        },
      ];
    }),
  ) as ToolSet;
};

const requiresConnectedAppAuthorization = (value: unknown): boolean => {
  if (typeof value === "string") {
    return /needs[_ -]?connection|not connected|connection required|connectlink|redirecturl/i.test(value);
  }
  if (Array.isArray(value)) return value.some(requiresConnectedAppAuthorization);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) =>
        /connectlink|redirecturl/i.test(key) || requiresConnectedAppAuthorization(item),
    );
  }
  return false;
};

const wrapToolsWithApproval = (
  tools: ToolSet,
  input: SakhiConversationInput,
): ToolSet => {
  if (input.channel !== "whatsapp") return tools;
  const approval = new WhatsAppToolApprovalStore();
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const executable = definition as typeof definition & {
        execute?: (...args: unknown[]) => unknown;
      };
      if (
        typeof executable.execute !== "function" ||
        !isConsequentialWhatsAppTool(name)
      ) return [name, definition];
      return [name, {
        ...definition,
        execute: async (...args: unknown[]) => {
          const exactArgs = args[0];
          return approval.request({
            userId: input.userId,
            threadId: input.threadId,
            toolName: name,
            args: exactArgs,
          });
        },
      }];
    }),
  ) as ToolSet;
};

const cancellationError = () => {
  const error = new Error("Cancelled");
  error.name = "AbortError";
  return error;
};

const wrapToolsWithCancellation = (
  tools: ToolSet,
  shouldCancel: SakhiConversationInput["shouldCancel"],
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
          if (await shouldCancel()) throw cancellationError();
          return original.apply(definition, args);
        },
      }];
    }),
  ) as ToolSet;
};

const emitProgress = async (
  callback: SakhiConversationInput["onProgress"],
  event: WhatsAppProgressEvent,
) => {
  try {
    await callback?.(event);
  } catch (error) {
    console.error("Non-fatal Sakhi progress delivery failure", {
      kind: event.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const runSakhiConversation = async (
  input: SakhiConversationInput,
  dependencies: SakhiConversationDependencies = {},
): Promise<SakhiConversationResult> => {
  const modelId = getModelById(input.modelId ?? "")?.id ?? getDefaultModel().id;
  const checkAccess = dependencies.checkAccess ?? checkTaskAccess;
  const deduct = dependencies.deduct ?? deductCredits;
  const generate = dependencies.generate ?? generateText;

  await emitProgress(input.onProgress, { kind: "accepted", label: "Working on it" });
  const access = await checkAccess({ userId: input.userId, modelId });
  const user = (access.userData as Partial<IUser> | undefined) ?? {};
  const baseUrl = input.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? process.env.APP_URL ?? "https://trysakhi.com";
  const context = await createServerConversationContext({
    userId: input.userId,
    threadId: input.threadId,
    modelId,
    baseUrl,
    channel: input.channel,
    channelMessageId: input.channelMessageId,
    user,
  });
  const contextTools = context.tools as ToolSet;
  if (await input.shouldCancel?.()) throw cancellationError();
  const tools = wrapToolsWithCancellation(
    wrapToolsWithApproval(
      wrapToolsWithProgress(
        context.tools,
        (event) => emitProgress(input.onProgress, event),
      ),
      input,
    ),
    input.shouldCancel,
  );
  const approvedToolNames: string[] = [];
  const result = await (async () => {
    try {
      if (input.approvedAction) {
        const definition = contextTools[input.approvedAction.toolName] as
          | (ToolSet[string] & { execute?: (...args: unknown[]) => unknown })
          | undefined;
        if (!definition || typeof definition.execute !== "function") {
          await new WhatsAppToolApprovalStore().finish(
            input.userId,
            input.threadId,
            "outcome_unknown",
          );
          throw new Error("The confirmed action is no longer available");
        }
        if (await input.shouldCancel?.()) throw cancellationError();
        const progress = getWhatsAppToolProgress(input.approvedAction.toolName);
        if (progress) await emitProgress(input.onProgress, progress[0]);
        approvedToolNames.push(input.approvedAction.toolName);
        let output: unknown;
        try {
          output = await definition.execute(input.approvedAction.exactInput, {
            toolCallId: `whatsapp-confirmed-${input.channelMessageId ?? input.threadId}`,
            messages: input.messages,
            abortSignal: input.signal,
          });
          const awaitingAuthorization = requiresConnectedAppAuthorization(output);
          await new WhatsAppToolApprovalStore().finish(
            input.userId,
            input.threadId,
            awaitingAuthorization ? "awaiting_auth" : "completed",
          );
          if (!awaitingAuthorization && progress) await emitProgress(input.onProgress, progress[1]);
        } catch (error) {
          await new WhatsAppToolApprovalStore().finish(
            input.userId,
            input.threadId,
            "outcome_unknown",
          );
          throw error;
        }
        const connectionTool = contextTools.COMPOSIO_MANAGE_CONNECTIONS;
        const summaryTools = requiresConnectedAppAuthorization(output) && connectionTool
          ? wrapToolsWithCancellation(
              wrapToolsWithProgress(
                { COMPOSIO_MANAGE_CONNECTIONS: connectionTool },
                (event) => emitProgress(input.onProgress, event),
              ),
              input.shouldCancel,
            )
          : undefined;
        return generate({
          model: modelId,
          system: `${context.system}\nReport the confirmed tool result clearly and briefly. Preserve any connection or result URL exactly. You may use COMPOSIO_MANAGE_CONNECTIONS only when the result says authorization is required. Do not call any other tool or claim anything beyond the result.`,
          messages: [{
            role: "user",
            content: `Confirmed action: ${input.approvedAction.toolName}\nTool result: ${JSON.stringify(output)}`,
          }],
          abortSignal: input.signal,
          tools: summaryTools,
          stopWhen: summaryTools ? stepCountIs(3) : undefined,
          ...getConversationProviderOptions(modelId, input.userId),
        });
      }
      return await generate({
      model: modelId,
      system: context.system,
      messages: input.messages,
      tools,
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
    } finally {
      await closeMcpClients(context.mcpClients);
    }
  })();
  const usage = usageFromAiSdk(modelId, result.totalUsage);
  const calculation = calculateCredits({
    models: [usage],
    toolCostNanoUsd: calculateMeteredToolCostNanoUsd(
      [
        ...approvedToolNames,
        ...result.steps.flatMap((step) =>
          step.toolCalls.flatMap((call) => {
            if (!call) return [];
            if (
              input.channel === "whatsapp" &&
              isConsequentialWhatsAppTool(call.toolName)
            ) return [];
            return [call.toolName];
          }),
        ),
      ],
    ),
    creditMultiplier: access.plan.creditMultiplier,
  });
  const deduction = await deduct({
    userId: input.userId,
    calculation,
    ...(input.channel === "whatsapp" && input.channelMessageId
      ? { idempotencyKey: `whatsapp:${input.channelMessageId}:conversation` }
      : {}),
  });
  if (
    input.channel === "whatsapp" &&
    deduction.deductedCredits < deduction.consumedCredits
  ) {
    await recordWhatsAppCreditDeficit({
      userId: input.userId,
      threadId: input.threadId,
      modelId,
      messageId: input.channelMessageId!,
      consumedCredits: deduction.consumedCredits,
      deductedCredits: deduction.deductedCredits,
    }).catch((error) => {
      console.error("Failed to record WhatsApp credit deficit", error);
    });
  }
  await emitProgress(input.onProgress, { kind: "completed", label: "Done" });

  return {
    text: result.text,
    modelId,
    creditsUsed: deduction.deductedCredits,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
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
