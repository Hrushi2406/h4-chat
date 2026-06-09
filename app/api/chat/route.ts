import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ToolSet,
} from "ai";
import { Geo, geolocation } from "@vercel/functions";
import { getModelById } from "@/lib/available-models";
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

  console.log("using model: ", model.id);

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
    model,
  );
  const needsComposioFileRule =
    Boolean(composioTools) && messagesWithFileUrls !== messages;
  latency.step("message prep");

  const systemPrompt = getSystemPrompt(
    geo,
    Boolean(composioTools),
    needsComposioFileRule,
    mcpContext?.servers,
    userInfo,
  );
  latency.step("system prompt");

  const closeMcpClientsOnce = createCloseMcpClientsOnce(
    mcpContext?.clients ?? [],
  );
  const tools = {
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
    model: model.id,
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
        ? `- You can use connected-app tools through Composio for email, calendar, drive, docs, spreadsheets, project management, developer workflows, CRM, payments, commerce, personal finance, design, Google Workspace, social media, ads, SEO, browser automation, media generation, and fitness tasks.
      Composio tool names are canonical uppercase slugs using the ${COMPOSIO_TOOL_NAME_PATTERN} pattern, for example ${COMPOSIO_TOOLKIT_EXAMPLES.join(", ")}. Do not invent Composio tool names.
      For discovery, call ${COMPOSIO_META_TOOLS.SEARCH_TOOLS} first. Use returned tool slugs as-is. If you need exact input fields, call ${COMPOSIO_META_TOOLS.GET_TOOL_SCHEMAS} with tool_slugs from search results.
      For authorization or connection status, call ${COMPOSIO_META_TOOLS.MANAGE_CONNECTIONS} with valid toolkit slugs such as gmail, googlecalendar, googledrive, notion, linear, github, googledocs, googlesheets, outlook, hubspot, salesforce, confluence, stripe, splitwise, shopify, pexels, figma, canva, instagram, whatsapp, youtube, metaads, googleads, reddit, facebook, linkedin, ahrefs, firecrawl, gemini, composio_search, or browser_tool, then provide the Connect Link in chat. After the user returns from authorization, the app may send a short “Connected” message automatically; continue the original task from the conversation history.
      Execute selected app actions with ${COMPOSIO_META_TOOLS.MULTI_EXECUTE_TOOL} when actions are independent.
      Never perform irreversible Composio actions without first asking the user for explicit confirmation and receiving a direct confirmation response. This includes sending DMs, emails, SMS, WhatsApp messages, social posts, comments, replies, publishing content, creating purchases, making payments, deleting data, or changing external records.
      Drafting, discussing, preparing, scheduling, or being asked to do an irreversible action is not permission to execute it. Do not assume permission from context or intent; ask once directly and wait for the user's confirmation before using the Composio tool that performs the action.`
        : ""
    }
    ${
      needsComposioFileRule
        ? `- For uploaded file URLs unsupported by this model, use Composio tools to inspect/analyze the file before answering; never guess file contents without tool results.`
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

  const unsupportedFiles = messages.flatMap((message) => {
    if (typeof message !== "object" || message === null) {
      return [];
    }

    const parts = (message as { parts?: unknown }).parts;

    if (!Array.isArray(parts)) {
      return [];
    }

    return parts.flatMap((part) => {
      if (typeof part !== "object" || part === null) {
        return [];
      }

      const filePart = part as {
        type?: unknown;
        url?: unknown;
        filename?: unknown;
        mediaType?: unknown;
      };
      const mediaType =
        typeof filePart.mediaType === "string" ? filePart.mediaType : undefined;

      if (
        filePart.type !== "file" ||
        typeof filePart.url !== "string" ||
        isFileTypeSupportedByModel(mediaType, model)
      ) {
        return [];
      }

      return [
        `- ${typeof filePart.filename === "string" ? filePart.filename : "uploaded file"}${
          mediaType ? ` (${mediaType})` : ""
        }: ${filePart.url}`,
      ];
    });
  });

  if (unsupportedFiles.length === 0) {
    return messages;
  }

  const fileContext = `Uploaded file URLs for this message:\n${unsupportedFiles.join(
    "\n",
  )}`;

  return messages.map((message, index) => {
    if (
      index !== messages.length - 1 ||
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
  const origin = new URL(req.url).origin;

  return threadId
    ? `${origin}/chat/${threadId}?composioAuth=complete`
    : `${origin}/chat?composioAuth=complete`;
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
