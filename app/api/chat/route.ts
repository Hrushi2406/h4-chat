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
  type McpServerInput,
} from "@/lib/mcp";
import {
  COMPOSIO_META_TOOLS,
  COMPOSIO_TOOLKIT_EXAMPLES,
  COMPOSIO_TOOL_NAME_PATTERN,
} from "@/lib/types/composio-tool-slugs";
import { IUser } from "@/lib/types/user";

export async function POST(req: Request) {
  const {
    messages,
    modelId = "deepseek/deepseek-v4-flash",
    userInfo,
    authToken,
    threadId,
    mcpServers = [],
  } = await req.json();

  const geo = geolocation(req);
  const model = getModelById(modelId);

  if (!model) {
    return new Response("Invalid model ID", { status: 400 });
  }

  console.log("using model: ", model.id);

  const verifiedUserId = await verifyFirebaseIdToken(authToken);
  const composioTools = await getComposioTools(
    verifiedUserId,
    getChatCallbackUrl(req, threadId),
  );
  const mcpContext = await createMcpToolContext(
    verifiedUserId,
    normalizeRequestMcpServers(mcpServers),
  );
  const messagesWithFileUrls = appendUnsupportedFileUrlsToMessages(
    messages,
    model,
  );
  const needsComposioFileRule =
    Boolean(composioTools) && messagesWithFileUrls !== messages;
  const systemPrompt = getSystemPrompt(
    geo,
    Boolean(composioTools),
    needsComposioFileRule,
    mcpContext?.servers,
    userInfo,
  );
  const closeMcpClientsOnce = createCloseMcpClientsOnce(
    mcpContext?.clients ?? [],
  );
  const tools = {
    ...composioTools,
    ...mcpContext?.tools,
  } satisfies ToolSet;

  const result = streamText({
    model: model.id,
    system: systemPrompt,
    messages: await convertToModelMessages(messagesWithFileUrls.slice(-10), {
      tools,
      ignoreIncompleteToolCalls: true,
    }),
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

  return result.toUIMessageStreamResponse({
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
}

const getRequestPromptFromHints = (geo: Geo) => `\
About the origin of user's request:
- lat: ${geo.longitude}
- lon: ${geo.latitude}
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
    - ${
      composioEnabled &&
      `You can use connected-app tools through Composio for email, calendar, drive, docs, spreadsheets, project management, developer workflows, CRM, payments, commerce, personal finance, design, Google Workspace, social media, ads, SEO, browser automation, media generation, and fitness tasks.
      Composio tool names are canonical uppercase slugs using the ${COMPOSIO_TOOL_NAME_PATTERN} pattern, for example ${COMPOSIO_TOOLKIT_EXAMPLES.join(", ")}. Do not invent Composio tool names.
      For discovery, call ${COMPOSIO_META_TOOLS.SEARCH_TOOLS} first. Use returned tool slugs as-is. If you need exact input fields, call ${COMPOSIO_META_TOOLS.GET_TOOL_SCHEMAS} with tool_slugs from search results.
      For authorization or connection status, call ${COMPOSIO_META_TOOLS.MANAGE_CONNECTIONS} with valid toolkit slugs such as gmail, googlecalendar, googledrive, notion, linear, github, googledocs, googlesheets, outlook, hubspot, salesforce, confluence, stripe, splitwise, shopify, pexels, figma, canva, instagram, whatsapp, youtube, metaads, googleads, reddit, facebook, linkedin, ahrefs, firecrawl, gemini, composio_search, or browser_tool, then provide the Connect Link in chat. After the user returns from authorization, the app may send a short “Connected” message automatically; continue the original task from the conversation history.
      Execute selected app actions with ${COMPOSIO_META_TOOLS.MULTI_EXECUTE_TOOL} when actions are independent.
      Never perform irreversible Composio actions without first asking the user for explicit confirmation and receiving a direct confirmation response. This includes sending DMs, emails, SMS, WhatsApp messages, social posts, comments, replies, publishing content, creating purchases, making payments, deleting data, or changing external records.
      Drafting, discussing, preparing, scheduling, or being asked to do an irreversible action is not permission to execute it. Do not assume permission from context or intent; ask once directly and wait for the user's confirmation before using the Composio tool that performs the action.`
    }
    - ${
      needsComposioFileRule &&
      `For uploaded file URLs unsupported by this model, use Composio tools to inspect/analyze the file before answering; never guess file contents without tool results.`
    }
    - ${
      mcpServers?.length &&
      `You can use configured MCP server tools when they are relevant.
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
    }

    ${name && `User's name is ${name}`}
    ${occupation && `User's occupation is ${occupation}`}
    ${userPreferences && `User's preferences are ${userPreferences}`}
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
): Promise<ToolSet | undefined> {
  if (!userId || !isComposioConfigured()) {
    return undefined;
  }

  try {
    const session = await createComposioSession(userId, { callbackUrl });
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

const normalizeRequestMcpServers = (value: unknown): McpServerInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((server): McpServerInput | undefined => {
      if (typeof server !== "object" || server === null) {
        return undefined;
      }

      const candidate = server as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id : undefined;
      const url =
        typeof candidate.url === "string" ? candidate.url.trim() : undefined;

      if (!id || !url) {
        return undefined;
      }

      return {
        id,
        name: typeof candidate.name === "string" ? candidate.name : undefined,
        url,
        transport: candidate.transport === "sse" ? "sse" : "http",
        headers: normalizeRequestHeaders(candidate.headers),
        enabled:
          typeof candidate.enabled === "boolean" ? candidate.enabled : true,
      };
    })
    .filter((server): server is McpServerInput => Boolean(server));
};

const normalizeRequestHeaders = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const headers = Object.entries(value).reduce<Record<string, string>>(
    (acc, [key, headerValue]) => {
      if (typeof headerValue === "string") {
        acc[key] = headerValue;
      }

      return acc;
    },
    {},
  );

  return Object.keys(headers).length > 0 ? headers : undefined;
};
