import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
} from "ai";
import { Geo, geolocation } from "@vercel/functions";
import { z } from "zod";
import {
  DEFAULT_IMAGE_ANALYSIS_MODEL_ID,
  getModelById,
} from "@/lib/available-models";
import {
  createComposioSession,
  getWrappedComposioTools,
  isComposioConfigured,
} from "@/lib/composio";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";
import {
  closeMcpClients,
  createMcpToolContext,
} from "@/lib/mcp";
import { getUserMcpServersFromFirestore } from "@/lib/mcp-firestore";
import {
  COMPOSIO_META_TOOLS,
  COMPOSIO_TOOLKIT_EXAMPLES,
  COMPOSIO_TOOL_NAME_PATTERN,
} from "@/lib/types/composio-tool-slugs";
import { IUser } from "@/lib/types/user";
import scheduledTaskServerService from "@/lib/services/scheduled-task-server-service";

export async function POST(req: Request) {
  const latency = createLatencyLogger();

  const {
    messages,
    modelId = "deepseek/deepseek-v4-flash",
    userInfo,
    authToken,
    threadId,
  } = await req.json();
  latency.step("parse body", { threadId, modelId });

  const geo = geolocation(req);
  const model = getModelById(modelId);
  latency.step("model lookup");

  if (!model) {
    return new Response("Invalid model ID", { status: 400 });
  }

  const effectiveModel = getEffectiveModelForRequest(messages, model);

  if (!effectiveModel) {
    return new Response("Image analysis model is not configured", {
      status: 500,
    });
  }

  const imageFallbackUsed = effectiveModel.id !== model.id;

  console.log("using model: ", effectiveModel.id, {
    requestedModel: model.id,
    effectiveModel: effectiveModel.id,
    imageFallbackUsed,
  });

  const verifiedUserId = await verifyFirebaseIdToken(authToken);
  latency.step("firebase auth");

  const parallelStart = performance.now();
  const [composioTools, mcpContext] = await Promise.all([
    (async () => {
      const start = performance.now();
      const tools = await getComposioTools(
        verifiedUserId,
        getChatCallbackUrl(req, threadId),
        threadId,
      );
      console.log(
        `composio tools: +${Math.round(performance.now() - start)}ms (${Math.round(performance.now() - parallelStart)}ms since parallel start)`,
      );
      return tools;
    })(),
    (async () => {
      const start = performance.now();
      const mcpServers = await getUserMcpServersFromFirestore({
        userId: verifiedUserId,
      });
      console.log(
        `mcp firestore: +${Math.round(performance.now() - start)}ms (${Math.round(performance.now() - parallelStart)}ms since parallel start)`,
      );
      const ctxStart = performance.now();
      const ctx = await createMcpToolContext(verifiedUserId, mcpServers);
      console.log(
        `mcp clients: +${Math.round(performance.now() - ctxStart)}ms (${Math.round(performance.now() - parallelStart)}ms since parallel start)`,
      );
      return ctx;
    })(),
  ]);
  latency.step("parallel tools (composio + mcp)", {
    composioToolCount: composioTools ? Object.keys(composioTools).length : 0,
    mcpToolCount: mcpContext?.tools ? Object.keys(mcpContext.tools).length : 0,
    mcpServerCount: mcpContext?.servers?.length ?? 0,
  });

  const messagesWithFileUrls = appendUnsupportedFileUrlsToMessages(
    messages,
    effectiveModel,
  );
  const needsComposioFileRule =
    Boolean(composioTools) && messagesWithFileUrls !== messages;
  latency.step("message prep");

  const systemPrompt = `${getSystemPrompt(
    geo,
    Boolean(composioTools),
    needsComposioFileRule,
    mcpContext?.servers,
    userInfo,
  )}\n${getScheduledTaskSystemPrompt()}`;
  latency.step("system prompt");

  const closeMcpClientsOnce = createCloseMcpClientsOnce(
    mcpContext?.clients ?? [],
  );
  const tools = {
    ...createScheduledTaskTools({
      userId: verifiedUserId,
      threadId,
      modelId,
      baseUrl: getBaseUrl(req),
    }),
    ...composioTools,
    ...mcpContext?.tools,
  } satisfies ToolSet;
  const contextMessages = messagesWithFileUrls.slice(-10);

  const modelMessages = await convertToModelMessages(contextMessages, {
    tools,
    ignoreIncompleteToolCalls: true,
  });
  latency.step("convert messages", { contextMessages: contextMessages.length });

  const result = streamText({
    model: effectiveModel.id,
    system: systemPrompt,
    messages: modelMessages,
    stopWhen: stepCountIs(100),
    onError: async (error) => {
      console.log("error: ", error);
      await closeMcpClientsOnce();
    },
    onAbort: async () => {
      await closeMcpClientsOnce();
    },
    onFinish: async () => {
      await closeMcpClientsOnce();
    },

    tools,
  });
  latency.step("streamText init");

  const response = result.toUIMessageStreamResponse({
    sendReasoning: true,
    messageMetadata: ({ part }) => {
      if (part.type !== "finish") {
        return undefined;
      }

      const inputTokens = part.totalUsage.inputTokens ?? 0;
      const outputTokens = part.totalUsage.outputTokens ?? 0;

      return {
        inputTokens,
        outputTokens,
        totalTokens: part.totalUsage.totalTokens ?? inputTokens + outputTokens,
        requestedModel: model.id,
        effectiveModel: effectiveModel.id,
        imageFallbackUsed,
      };
    },
  });

  if (!response.body) {
    return response;
  }

  const requestStart = latency.start;
  let firstChunk = true;
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (firstChunk) {
          firstChunk = false;
          console.log(
            `first stream chunk: ${Math.round(performance.now() - requestStart)}ms since request start`,
          );
        }
        controller.enqueue(chunk);
      },
    }),
  );

  return new Response(body, {
    status: response.status,
    headers: response.headers,
  });
}

function getEffectiveModelForRequest(
  messages: unknown,
  requestedModel: NonNullable<ReturnType<typeof getModelById>>,
) {
  if (
    !latestUserMessageHasImageAttachment(messages) ||
    requestedModel.capabilities.imageInput
  ) {
    return requestedModel;
  }

  return getModelById(DEFAULT_IMAGE_ANALYSIS_MODEL_ID);
}

function latestUserMessageHasImageAttachment(messages: unknown) {
  if (!Array.isArray(messages)) {
    return false;
  }

  const latestUserMessage = messages.findLast((message) => {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    return (message as { role?: unknown }).role === "user";
  });

  if (typeof latestUserMessage !== "object" || latestUserMessage === null) {
    return false;
  }

  const parts = (latestUserMessage as { parts?: unknown }).parts;

  if (!Array.isArray(parts)) {
    return false;
  }

  return parts.some((part) => {
    if (typeof part !== "object" || part === null) {
      return false;
    }

    const filePart = part as {
      type?: unknown;
      mediaType?: unknown;
    };

    return (
      filePart.type === "file" &&
      typeof filePart.mediaType === "string" &&
      filePart.mediaType.startsWith("image/")
    );
  });
}

const getRequestPromptFromHints = (geo: Geo) => `\
About the origin of user's request:
- lat: ${geo.latitude}
- lon: ${geo.longitude}
- city: ${geo.city}
- country: ${geo.country}
`;

const getSystemPrompt = (
  geo: Geo,
  composioEnabled: boolean,
  needsComposioFileRule: boolean,
  mcpServers:
    | Array<{
        id: string;
        name: string;
        instructions?: string;
        toolNames: string[];
      }>
    | undefined,
  userInfo: Partial<IUser>,
) => {
  const requestHints = getRequestPromptFromHints(geo);

  const { name, occupation, userPreferences } = userInfo;

  return `You are Sakhi, a trusted AI friend who talks in a natural way, helps people get things done, and keeps answers short unless they need more details. Give clear and well-formatted responses in markdown.

   Guidelines:
    - Answer directly first.
    - Keep responses brief by default. Use longer explanations only when the user asks or the task requires it.
    - Use simple language, short paragraphs, and concise bullet points when helpful.
    - Avoid repetition, filler, and unnecessary background.
    - Include a follow-up question only when it is needed to move the conversation forward.
    - Suggest next steps only when they are useful and specific.
    ${
      composioEnabled
        ? `- You can use connected-app tools for email, calendar, drive, docs, spreadsheets, project management, developer workflows, CRM, payments, commerce, personal finance, design, Google Workspace, social media, ads, SEO, browser automation, media generation, and fitness tasks.
      Connected-app tool names are canonical uppercase slugs using the ${COMPOSIO_TOOL_NAME_PATTERN} pattern, for example ${COMPOSIO_TOOLKIT_EXAMPLES.join(", ")}. Do not invent connected-app tool names.
      For discovery, call ${COMPOSIO_META_TOOLS.SEARCH_TOOLS} first. Use returned tool slugs as-is. If you need exact input fields, call ${COMPOSIO_META_TOOLS.GET_TOOL_SCHEMAS} with tool_slugs from search results.
      For authorization or connection status, call ${COMPOSIO_META_TOOLS.MANAGE_CONNECTIONS} with valid toolkit slugs such as gmail, googlecalendar, googledrive, notion, linear, github, googledocs, googlesheets, outlook, hubspot, salesforce, confluence, stripe, splitwise, shopify, pexels, figma, canva, instagram, whatsapp, youtube, vapi, metaads, googleads, reddit, facebook, linkedin, ahrefs, firecrawl, gemini, composio_search, or browser_tool, then provide the Connect Link in chat. After the user returns from authorization, the app may send a short “Connected” message automatically; continue the original task from the conversation history.
      Execute selected app actions with ${COMPOSIO_META_TOOLS.MULTI_EXECUTE_TOOL} when actions are independent.
      Never perform irreversible connected-app actions without first asking the user for explicit confirmation and receiving a direct confirmation response. This includes sending DMs, emails, SMS, WhatsApp messages, social posts, comments, replies, publishing content, creating purchases, making payments, deleting data, or changing external records.
      Drafting, discussing, preparing, scheduling, or being asked to do an irreversible action is not permission to execute it. Do not assume permission from context or intent; ask once directly and wait for the user's confirmation before using the connected-app tool that performs the action.`
        : ""
    }
    ${
      needsComposioFileRule
        ? `- For uploaded file URLs unsupported by this model, use connected-app tools to inspect/analyze the file before answering; never guess file contents without tool results.`
        : ""
    }
    ${
      mcpServers?.length
        ? `- You can use configured MCP server tools when they are relevant.
      MCP tool names are namespaced as mcp_<server>_<tool>. Available MCP servers:
      ${mcpServers
        .map(
          (server) =>
            `- ${server.name} (${server.id}): ${server.toolNames.join(", ")}${
              server.instructions
                ? `\n  Server instructions: ${server.instructions}`
                : ""
            }`,
        )
        .join("\n")}
      Drafting/discussing a message is not permission to send it.
      Before sending any external message or reply, ask for explicit confirmation unless the user clearly says to send/reply now.`
        : ""
    }

    ${name ? `User's name is ${name}` : ""}
    ${occupation ? `User's occupation is ${occupation}` : ""}
    ${userPreferences ? `User's preferences are ${userPreferences}` : ""}
    If a tool call fails, do not retry the same failing tool repeatedly. Briefly explain the failure, continue with a best-effort direct answer, and only ask for user input when necessary.
    ${requestHints}
    `;
};

function appendUnsupportedFileUrlsToMessages(
  messages: unknown,
  model: NonNullable<ReturnType<typeof getModelById>>,
) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const unsupportedFiles: string[] = [];
  const latestMessageIndex = messages.length - 1;
  let removedAnyUnsupportedFile = false;
  const sanitizedMessages = messages.map((message, messageIndex) => {
    if (typeof message !== "object" || message === null) {
      return message;
    }

    const parts = (message as { parts?: unknown }).parts;

    if (!Array.isArray(parts)) {
      return message;
    }

    let removedUnsupportedFile = false;
    const supportedParts = parts.filter((part) => {
      if (typeof part !== "object" || part === null) {
        return true;
      }

      const filePart = part as {
        type?: unknown;
        url?: unknown;
        filename?: unknown;
        mediaType?: unknown;
      };
      const mediaType =
        typeof filePart.mediaType === "string" ? filePart.mediaType : undefined;

      if (filePart.type !== "file" || isFileTypeSupportedByModel(mediaType, model)) {
        return true;
      }

      removedUnsupportedFile = true;
      removedAnyUnsupportedFile = true;
      if (messageIndex === latestMessageIndex) {
        unsupportedFiles.push(
          `- ${typeof filePart.filename === "string" ? filePart.filename : "uploaded file"}${
            mediaType ? ` (${mediaType})` : ""
          }: ${
            typeof filePart.url === "string"
              ? filePart.url
              : "No accessible file URL was provided."
          }`,
        );
      }
      return false;
    });

    return removedUnsupportedFile
      ? { ...message, parts: supportedParts }
      : message;
  });

  if (unsupportedFiles.length === 0) {
    if (removedAnyUnsupportedFile) {
      return sanitizedMessages;
    }

    return messages;
  }

  const fileContext = `Uploaded file URLs for this message:\n${unsupportedFiles.join(
    "\n",
  )}`;

  return sanitizedMessages.map((message, index) => {
    if (
      index !== sanitizedMessages.length - 1 ||
      typeof message !== "object" ||
      message === null
    ) {
      return message;
    }

    const parts = Array.isArray((message as { parts?: unknown }).parts)
      ? [
          ...(message as { parts: unknown[] }).parts,
          { type: "text", text: fileContext },
        ]
      : [{ type: "text", text: fileContext }];

    return { ...message, parts };
  });
}

function isFileTypeSupportedByModel(
  mediaType: string | undefined,
  model: NonNullable<ReturnType<typeof getModelById>>,
) {
  if (!mediaType) {
    return model.capabilities.documentInput;
  }

  if (mediaType.startsWith("image/")) {
    return model.capabilities.imageInput;
  }

  if (mediaType === "application/pdf") {
    return model.capabilities.pdfInput;
  }

  if (
    mediaType === "text/csv" ||
    mediaType === "application/csv" ||
    mediaType === "text/comma-separated-values"
  ) {
    return model.capabilities.csvInput;
  }

  return model.capabilities.documentInput;
}

async function getComposioTools(
  userId?: string,
  callbackUrl?: string,
  threadId?: string,
): Promise<ToolSet | undefined> {
  if (!userId || !isComposioConfigured()) {
    return undefined;
  }

  try {
    const session = await createComposioSession(userId, {
      callbackUrl,
      threadId,
    });
    return getWrappedComposioTools(await session.tools());
  } catch (error) {
    console.error("Failed to load Composio tools:", error);
    return undefined;
  }
}

function getChatCallbackUrl(req: Request, threadId?: string) {
  const origin = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");

  return threadId
    ? `${origin}/chat/${threadId}?composioAuth=complete`
    : `${origin}/chat?composioAuth=complete`;
}

function getBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

function createScheduledTaskTools({
  userId,
  threadId,
  modelId,
  baseUrl,
}: {
  userId?: string;
  threadId?: string;
  modelId: string;
  baseUrl: string;
}): ToolSet {
  if (!userId) {
    return {};
  }

  return {
    create_scheduled_task: tool({
      description:
        "Create a recurring automation for the user when they ask the assistant to do something on a repeated schedule.",
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .describe("Short, user-facing automation name."),
        instruction: z
          .string()
          .min(1)
          .describe(
            "The full instruction to execute each time the automation runs. Include all relevant context from the user's request.",
          ),
        cron: z
          .string()
          .min(1)
          .describe(
            "A standard 5-field cron expression, without seconds. Example: 0 20 * * * for every day at 8 PM.",
          ),
        timezone: z
          .string()
          .min(1)
          .default("Asia/Kolkata")
          .describe(
            "IANA timezone for the schedule, for example Asia/Kolkata or America/New_York.",
          ),
        humanText: z
          .string()
          .min(1)
          .describe("Natural-language schedule summary shown in the UI."),
      }),
      execute: async ({ title, instruction, cron, timezone, humanText }) => {
        const task = await scheduledTaskServerService.createTask({
          userId,
          title,
          instruction,
          cron,
          timezone,
          humanText,
          source: "chat",
          sourceThreadId: threadId,
          modelId,
          baseUrl,
        });

        return {
          ok: true,
          taskId: task.id,
          title: task.title,
          schedule: task.schedule.humanText,
          status: task.status,
          message:
            "Automation created. The user can inspect and test it from Automations.",
        };
      },
    }),
  } satisfies ToolSet;
}

function getScheduledTaskSystemPrompt() {
  return `Automations:
- If the user asks you to do something on a recurring schedule, call create_scheduled_task.
- Examples include "every day at 8 PM", "each Monday morning", "every 6 hours", or similar repeated schedules.
- Use a 5-field cron expression. Do not include seconds.
- Use the user's explicitly stated timezone when provided. If they only provide a local time, use Asia/Kolkata.
- The automation instruction should describe the work to perform when the schedule fires, not the act of scheduling it.
- After creating the automation, briefly confirm the schedule and mention that they can use Automations > Run now to test the output.`;
}

const createCloseMcpClientsOnce = (
  clients: Parameters<typeof closeMcpClients>[0],
) => {
  let didClose = false;

  return async () => {
    if (didClose || clients.length === 0) {
      return;
    }

    didClose = true;
    await closeMcpClients(clients);
  };
};

const createLatencyLogger = () => {
  const start = performance.now();
  let last = start;

  return {
    step: (name: string, extra?: Record<string, unknown>) => {
      const now = performance.now();
      const line = `${name}: +${Math.round(now - last)}ms (${Math.round(now - start)}ms total)`;
      console.log(extra ? `${line} ${JSON.stringify(extra)}` : line);
      last = now;
    },
    start,
  };
};
