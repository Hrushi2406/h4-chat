import type { ToolSet } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

export const COMPOSIO_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "notion",
  "linear",
  "github",
  "trello",
  "googledocs",
  "googlesheets",
  "outlook",
  "hubspot",
  "salesforce",
  "confluence",
  "stripe",
  "splitwise",
  "googleslides",
  "googletasks",
  "googlemeet",
  "googlephotos",
  "google_maps",
  "google_search_console",
  "shopify",
  "pexels",
  "figma",
  "canva",
  "instagram",
  "whatsapp",
  "strava",
  "youtube",
  "elevenlabs",
  "vapi",
  "cats",
  "fal_ai",
  "todoist",
  "metaads",
  "googleads",
  "reddit",
  "facebook",
  "linkedin",
  "ahrefs",
  "firecrawl",
  "gemini",
  "composio_search",
  "browser_tool",
] as const;

export const COMPOSIO_TOOLKIT_LABELS: Record<ComposioToolkit, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  notion: "Notion",
  linear: "Linear",
  github: "GitHub",
  trello: "Trello",
  googledocs: "Google Docs",
  googlesheets: "Google Sheets",
  outlook: "Outlook",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  confluence: "Confluence",
  stripe: "Stripe",
  splitwise: "Splitwise",
  googleslides: "Google Slides",
  googletasks: "Google Tasks",
  googlemeet: "Google Meet",
  googlephotos: "Google Photos",
  google_maps: "Google Maps",
  google_search_console: "Google Search Console",
  shopify: "Shopify",
  pexels: "Pexels",
  figma: "Figma",
  canva: "Canva",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  strava: "Strava",
  youtube: "YouTube",
  elevenlabs: "ElevenLabs",
  vapi: "Vapi",
  cats: "Cats",
  fal_ai: "Fal.ai",
  todoist: "Todoist",
  metaads: "Meta Ads",
  googleads: "Google Ads",
  reddit: "Reddit",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  ahrefs: "Ahrefs",
  firecrawl: "Firecrawl",
  gemini: "Gemini",
  composio_search: "Web Search",
  browser_tool: "Browser Tool",
};

export type ComposioToolkit = (typeof COMPOSIO_TOOLKITS)[number];

export const isComposioConfigured = () => Boolean(process.env.COMPOSIO_API_KEY);

export const getComposioUserId = (userId: string) => `h4-chat:${userId}`;

export const createComposioClient = () =>
  new Composio({
    provider: new VercelProvider(),
  });

type CreateComposioSessionOptions = {
  callbackUrl?: string;
  threadId?: string;
};

// Creating a Tool Router session costs a Composio API round-trip. For multi-turn
// chats we reuse the same session across messages (`composio.use`) instead of
// recreating it. The session id lives on the thread document (`composioSessionId`,
// alongside `shareId`) so it is co-located with the chat and cleaned up when the
// thread is deleted; an in-memory mirror lets warm instances skip the read.
// Sessions are scoped per thread because each thread has its own connection
// callback URL — reusing across threads would redirect auth to the wrong chat.
const COMPOSIO_SESSION_FIELD = "composioSessionId";
const sessionIdCache = new Map<string, string>();

const getSessionCacheKey = (userId: string, threadId?: string) =>
  threadId ?? `user:${userId}`;

const readStoredSessionId = async (
  threadId: string
): Promise<string | undefined> => {
  const db = getAdminFirestore();
  if (!db) {
    return undefined;
  }

  try {
    // Project only the session id — thread docs hold the full message history,
    // which we don't want to pull onto the request's latency path.
    const snapshot = await db
      .collection("threads")
      .where(FieldPath.documentId(), "==", threadId)
      .select(COMPOSIO_SESSION_FIELD)
      .limit(1)
      .get();
    const sessionId = snapshot.docs[0]?.get(COMPOSIO_SESSION_FIELD);
    return typeof sessionId === "string" ? sessionId : undefined;
  } catch (error) {
    console.error(
      "Failed to read stored Composio session id:",
      error instanceof Error ? error.message : error
    );
    return undefined;
  }
};

const persistSessionId = async (threadId: string, sessionId: string) => {
  const db = getAdminFirestore();
  if (!db) {
    return;
  }

  try {
    // update() (not set) so we never create a partial thread doc if the thread
    // hasn't been persisted yet; the in-memory mirror still serves reuse here.
    await db
      .collection("threads")
      .doc(threadId)
      .update({ [COMPOSIO_SESSION_FIELD]: sessionId });
  } catch (error) {
    console.error(
      "Failed to persist Composio session id:",
      error instanceof Error ? error.message : error
    );
  }
};

export const createComposioSession = async (
  userId: string,
  options: CreateComposioSessionOptions = {}
) => {
  const composio = createComposioClient();
  const { threadId } = options;
  const cacheKey = getSessionCacheKey(userId, threadId);

  const storedSessionId =
    sessionIdCache.get(cacheKey) ??
    (threadId ? await readStoredSessionId(threadId) : undefined);

  if (storedSessionId) {
    try {
      const session = await composio.use(storedSessionId);
      sessionIdCache.set(cacheKey, storedSessionId);
      return session;
    } catch (error) {
      // Session likely expired or was revoked; fall through to recreate it.
      sessionIdCache.delete(cacheKey);
      console.warn(
        `Composio session ${storedSessionId} could not be reused, recreating:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const session = await composio.create(getComposioUserId(userId), {
    toolkits: [...COMPOSIO_TOOLKITS],
    manageConnections: {
      enable: true,
      ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
    },
    multiAccount: {
      enable: true,
      maxAccountsPerToolkit: 3,
    },
  });

  sessionIdCache.set(cacheKey, session.sessionId);
  if (threadId) {
    void persistSessionId(threadId, session.sessionId);
  }

  return session;
};

export const getWrappedComposioTools = (tools: ToolSet): ToolSet =>
  Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => [
      toolName,
      wrapComposioTool(toolName, tool),
    ])
  );

const wrapComposioTool = (toolName: string, tool: ToolSet[string]) => {
  if (
    !tool ||
    typeof tool !== "object" ||
    !("execute" in tool) ||
    typeof tool.execute !== "function"
  ) {
    return tool;
  }
  const executableTool = tool as ToolSet[string] & {
    execute: (...args: unknown[]) => unknown;
  };

  return {
    ...executableTool,
    execute: async (...args: unknown[]) => {
      try {
        return await executableTool.execute(...args);
      } catch (error) {
        const message = getComposioErrorMessage(error);
        console.error(`Composio tool ${toolName} failed:`, message, error);
        return {
          ok: false,
          error: "tool_execution_failed",
          tool: toolName,
          message,
          fallback:
            "Tool execution failed. Continue with best-effort reasoning and ask for clarification only if required.",
        };
      }
    },
  };
};

const getComposioErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    /* ignore serialization issues */
  }

  return "Unknown tool error";
};

export const isSupportedComposioToolkit = (
  toolkit: string
): toolkit is ComposioToolkit =>
  COMPOSIO_TOOLKITS.includes(toolkit as ComposioToolkit);
