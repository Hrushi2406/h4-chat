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
import { closeMcpClients } from "@/lib/mcp";
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
  signal?: AbortSignal;
  onProgress?: (event: WhatsAppProgressEvent) => void | Promise<void>;
  baseUrl?: string;
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

const progressForTools = (toolNames: string[]): WhatsAppProgressEvent | undefined => {
  if (toolNames.length === 0) return;
  const joined = toolNames.join(" ").toLowerCase();
  if (joined.includes("gmail") || joined.includes("outlook")) {
    return { kind: "connecting", label: "Working with email" };
  }
  if (joined.includes("calendar")) return { kind: "connecting", label: "Checking your calendar" };
  if (joined.includes("scheduled_task")) return { kind: "working", label: "Setting up the automation" };
  if (joined.includes("memory")) return { kind: "working", label: "Updating memory" };
  return { kind: "working", label: "Using a connected tool" };
};

const progressPairForTool = (toolName: string) => {
  const name = toolName.toLowerCase();
  if ((name.includes("gmail") || name.includes("email") || name.includes("outlook")) && name.includes("send")) {
    return [
      { kind: "working", label: "Sending email" },
      { kind: "completed", label: "Email sent" },
    ] satisfies WhatsAppProgressEvent[];
  }
  if (name.includes("scheduled_task") || name.includes("automation")) {
    return [
      { kind: "working", label: "Creating automation" },
      { kind: "completed", label: "Automation created" },
    ] satisfies WhatsAppProgressEvent[];
  }
  return [
    { kind: "connecting", label: "Connecting to your app" },
    { kind: "completed", label: "App task completed" },
  ] satisfies WhatsAppProgressEvent[];
};

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
      return [
        name,
        {
          ...definition,
          execute: async (...args: unknown[]) => {
            const [started, completed] = progressPairForTool(name);
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

export const runSakhiConversation = async (
  input: SakhiConversationInput,
  dependencies: SakhiConversationDependencies = {},
): Promise<SakhiConversationResult> => {
  const modelId = getModelById(input.modelId ?? "")?.id ?? getDefaultModel().id;
  const checkAccess = dependencies.checkAccess ?? checkTaskAccess;
  const deduct = dependencies.deduct ?? deductCredits;
  const generate = dependencies.generate ?? generateText;

  await input.onProgress?.({ kind: "accepted", label: "Working on it" });
  const access = await checkAccess({ userId: input.userId, modelId });
  await input.onProgress?.({ kind: "working", label: "Sakhi is thinking" });
  const user = (access.userData as Partial<IUser> | undefined) ?? {};
  const baseUrl = input.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? process.env.APP_URL ?? "https://trysakhi.com";
  const context = await createServerConversationContext({
    userId: input.userId,
    threadId: input.threadId,
    modelId,
    baseUrl,
    channel: input.channel,
    user,
  });
  const tools = wrapToolsWithProgress(context.tools, input.onProgress);
  const result = await (async () => {
    try {
      return await generate({
      model: modelId,
      system: context.system,
      messages: input.messages,
      tools,
      stopWhen: stepCountIs(100),
      abortSignal: input.signal,
      ...getConversationProviderOptions(modelId, input.userId),
        onStepFinish: async ({ toolCalls }) => {
          const progress = progressForTools(
            toolCalls.flatMap((call) => (call ? [call.toolName] : [])),
          );
          if (progress) await input.onProgress?.(progress);
        },
      });
    } finally {
      await closeMcpClients(context.mcpClients);
    }
  })();
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
  await deduct({ userId: input.userId, calculation });
  await input.onProgress?.({ kind: "completed", label: "Done" });

  return {
    text: result.text,
    modelId,
    creditsUsed: calculation.credits,
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
