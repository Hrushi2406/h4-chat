import type { UIMessage } from "ai";

type GeneratedToolCall = {
  type?: string;
  toolCallId: string;
  toolName: string;
  input?: unknown;
  dynamic?: boolean;
  providerExecuted?: boolean;
  title?: string;
};

type GeneratedToolResult = GeneratedToolCall & {
  output?: unknown;
};

type GeneratedToolError = GeneratedToolCall & {
  error?: unknown;
};

type GeneratedStep = {
  toolCalls?: readonly GeneratedToolCall[];
  toolResults?: readonly GeneratedToolResult[];
  content?: readonly unknown[];
};

type MutableToolPart = Record<string, unknown> & {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
};

const DEFAULT_EXCLUDED_TOOLS = new Set([
  "WHATSAPP_SEND_PROGRESS_UPDATE",
  "present_whatsapp_buttons",
  "present_whatsapp_media",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asToolCall = (value: unknown): GeneratedToolCall | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.toolCallId !== "string" ||
    typeof value.toolName !== "string"
  ) return undefined;
  return value as GeneratedToolCall;
};

const getContentParts = (step: GeneratedStep, type: string) =>
  (step.content ?? []).filter(
    (part): part is Record<string, unknown> =>
      isRecord(part) && part.type === type,
  );

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Tool call failed";

const hasDeferredProgressOutput = (
  part: MutableToolPart,
  toolName: string,
) =>
  isRecord(part.output) &&
  part.output.progressUpdateRequired === true &&
  part.output.pendingOperation === toolName;

const applyDeferredProgressOperations = (
  output: unknown,
  visibleToolParts: MutableToolPart[],
) => {
  if (!isRecord(output) || !Array.isArray(output.operations)) return;

  for (const operation of output.operations) {
    if (!isRecord(operation) || typeof operation.toolName !== "string") {
      continue;
    }
    const target = [...visibleToolParts].reverse().find(
      (part) =>
        (part.toolName ?? part.type.replace(/^tool-/, "")) ===
          operation.toolName &&
        hasDeferredProgressOutput(part, operation.toolName),
    );
    if (!target) continue;

    if (typeof operation.error === "string") {
      target.state = "output-error";
      target.errorText = operation.error;
      delete target.output;
    } else {
      target.state = "output-available";
      target.output = operation.result;
      delete target.errorText;
    }
  }
};

/** Convert generateText tool steps into the same UI message parts rendered by web chat. */
export const createGeneratedAssistantParts = (
  generation: { text: string; steps?: readonly GeneratedStep[] },
  options: { excludedToolNames?: ReadonlySet<string> } = {},
): UIMessage["parts"] => {
  const excluded = options.excludedToolNames ?? DEFAULT_EXCLUDED_TOOLS;
  const visibleToolParts: MutableToolPart[] = [];
  const partsByCallId = new Map<string, MutableToolPart>();

  for (const step of generation.steps ?? []) {
    const calls = step.toolCalls ?? getContentParts(step, "tool-call")
      .map(asToolCall)
      .filter((call): call is GeneratedToolCall => Boolean(call));

    for (const call of calls) {
      if (excluded.has(call.toolName)) continue;
      const part: MutableToolPart = {
        type: call.dynamic ? "dynamic-tool" : `tool-${call.toolName}`,
        ...(call.dynamic ? { toolName: call.toolName } : {}),
        toolCallId: call.toolCallId,
        state: "input-available",
        input: call.input,
        ...(call.providerExecuted !== undefined
          ? { providerExecuted: call.providerExecuted }
          : {}),
        ...(call.title ? { title: call.title } : {}),
      };
      visibleToolParts.push(part);
      partsByCallId.set(call.toolCallId, part);
    }

    const results = step.toolResults ?? getContentParts(step, "tool-result")
      .map(asToolCall)
      .filter((result): result is GeneratedToolResult => Boolean(result));

    for (const result of results) {
      if (result.toolName === "WHATSAPP_SEND_PROGRESS_UPDATE") {
        applyDeferredProgressOperations(result.output, visibleToolParts);
        continue;
      }
      if (excluded.has(result.toolName)) continue;
      const part = partsByCallId.get(result.toolCallId);
      if (!part) continue;
      part.state = "output-available";
      part.input = result.input ?? part.input;
      part.output = result.output;
    }

    for (const rawError of getContentParts(step, "tool-error")) {
      const toolError = asToolCall(rawError) as GeneratedToolError | undefined;
      if (!toolError || excluded.has(toolError.toolName)) continue;
      const part = partsByCallId.get(toolError.toolCallId);
      if (!part) continue;
      part.state = "output-error";
      part.input = toolError.input ?? part.input;
      part.errorText = errorText(toolError.error);
      delete part.output;
    }
  }

  return [
    ...(visibleToolParts as unknown as UIMessage["parts"]),
    { type: "text", text: generation.text },
  ];
};
