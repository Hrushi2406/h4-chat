import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ToolSet,
} from "ai";
import { Geo, geolocation } from "@vercel/functions";
import { getModelById } from "@/lib/available-models";
import { createComposioSession, isComposioConfigured } from "@/lib/composio";
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
    getChatCallbackUrl(req, threadId)
  );
  const mcpContext = await createMcpToolContext(
    verifiedUserId,
    normalizeRequestMcpServers(mcpServers)
  );
  const systemPrompt = getSystemPrompt(
    geo,
    Boolean(composioTools),
    mcpContext?.servers,
    userInfo
  );
  const closeMcpClientsOnce = createCloseMcpClientsOnce(
    mcpContext?.clients ?? []
  );
  const tools = {
    ...composioTools,
    ...mcpContext?.tools,
  } satisfies ToolSet;

  const result = streamText({
    model: model.id,
    system: systemPrompt,
    messages: await convertToModelMessages(messages.slice(-10), {
      tools,
      ignoreIncompleteToolCalls: true,
    }),
    stopWhen: stepCountIs(50),
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
  mcpServers:
    | Array<{
        id: string;
        name: string;
        instructions?: string;
        toolNames: string[];
      }>
    | undefined,
  userInfo: Partial<IUser>
) => {
  const requestHints = getRequestPromptFromHints(geo);

  const { name, occupation, userPreferences } = userInfo;

  return `You are a helpful AI assistant. Give short, clear, concise, and well-formatted responses in markdown.

   Guidelines:
    - Answer directly first.
    - Keep responses brief by default. Use longer explanations only when the user asks or the task requires it.
    - Use simple language, short paragraphs, and concise bullet points when helpful.
    - Avoid repetition, filler, and unnecessary background.
    - Include a follow-up question only when it is needed to move the conversation forward.
    - Suggest next steps only when they are useful and specific.
    - ${
      composioEnabled &&
      `You can use connected-app tools through Composio for email, calendar, drive, docs, spreadsheets, project management, developer workflows, CRM, payments, commerce, design, Google Workspace, social media, ads, SEO, browser automation, media generation, and fitness tasks.
      Composio tool names are canonical uppercase slugs using the ${COMPOSIO_TOOL_NAME_PATTERN} pattern, for example ${COMPOSIO_TOOLKIT_EXAMPLES.join(", ")}. Do not invent Composio tool names.
      For discovery, call ${COMPOSIO_META_TOOLS.SEARCH_TOOLS} first. Use returned tool slugs as-is. If you need exact input fields, call ${COMPOSIO_META_TOOLS.GET_TOOL_SCHEMAS} with tool_slugs from search results.
      For authorization or connection status, call ${COMPOSIO_META_TOOLS.MANAGE_CONNECTIONS} with valid toolkit slugs such as gmail, googlecalendar, googledrive, notion, linear, github, googledocs, googlesheets, outlook, hubspot, salesforce, confluence, stripe, shopify, pexels, figma, canva, instagram, whatsapp, youtube, metaads, googleads, reddit, facebook, linkedin, ahrefs, gemini, composio_search, or browser_tool, then provide the Connect Link in chat and continue once the user confirms.
      Execute selected app actions with ${COMPOSIO_META_TOOLS.MULTI_EXECUTE_TOOL} when actions are independent. Ask before taking irreversible actions such as sending email, deleting files, or creating/updating external records unless the user already gave explicit instructions.`
    }
    - ${
      mcpServers?.length &&
      `You can use configured MCP server tools when they are relevant.
      MCP tool names are namespaced as mcp_<server>_<tool>. Available MCP servers:
      ${mcpServers
        .map(
          (server) =>
            `- ${server.name} (${server.id}): ${server.toolNames.join(", ")}${
              server.instructions ? `\n  Server instructions: ${server.instructions}` : ""
            }`
        )
        .join("\n")}
      Before using MCP tools that place orders, submit payments, modify carts, or make external changes, ask for explicit user confirmation unless the user's message already provides unambiguous approval.`
    }

    ${name && `User's name is ${name}`}
    ${occupation && `User's occupation is ${occupation}`}
    ${userPreferences && `User's preferences are ${userPreferences}`}
    ${requestHints}
    `;
};

async function getComposioTools(
  userId?: string,
  callbackUrl?: string
): Promise<ToolSet | undefined> {
  if (!userId || !isComposioConfigured()) {
    return undefined;
  }

  try {
    const session = await createComposioSession(userId, { callbackUrl });
    return session.tools();
  } catch (error) {
    console.error("Failed to load Composio tools:", error);
    return undefined;
  }
}

function getChatCallbackUrl(req: Request, threadId?: string) {
  const origin = new URL(req.url).origin;

  return threadId ? `${origin}/chat/${threadId}` : origin;
}

const createCloseMcpClientsOnce = (clients: Parameters<typeof closeMcpClients>[0]) => {
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
    {}
  );

  return Object.keys(headers).length > 0 ? headers : undefined;
};
