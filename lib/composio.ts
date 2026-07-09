import type { ToolSet } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  createComposioAuthIntent,
  type ComposioAuthIntentSource,
} from "@/lib/composio-auth-intents";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

export const COMPOSIO_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "notion",
  "linear",
  "github",
  "vercel",
  "railway",
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
  vercel: "Vercel",
  railway: "Railway",
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
  skipStoredSessionRead?: boolean;
  userComposioSessionId?: string;
};

type GetComposioSessionToolsOptions = CreateComposioSessionOptions & {
  authContext?: {
    baseUrl: string;
    source: ComposioAuthIntentSource;
    threadId?: string;
  };
};

// Creating a Tool Router session costs a Composio API round-trip. Reuse one
// session per app user and persist it on users/{uid}; connected accounts are
// already user-scoped in Composio, so thread-scoped sessions are unnecessary.
//
// session.tools() is a second Composio round-trip that returns stable meta tools
// (search / schemas / execute / manage-connections). Cache those request-neutral
// tools per sessionId on warm instances. Chat-specific auth redirects are wrapped
// per request after cache lookup so cached tools never capture a thread callback.
const COMPOSIO_SESSION_FIELD = "composioSessionId";
const COMPOSIO_SESSION_UPDATED_AT_FIELD = "composioSessionUpdatedAt";
const COMPOSIO_MANAGE_CONNECTIONS_TOOL = "COMPOSIO_MANAGE_CONNECTIONS";
const COMPOSIO_API_BASE_URL = "https://backend.composio.dev/api/v3.1";
const TOOLS_CACHE_TTL_MS = 60 * 60_000;
const AUTH_CONFIG_CACHE_TTL_MS = 15 * 60_000;
const sessionIdCache = new Map<string, string>();
const toolsCache = new Map<string, { expiresAt: number; tools: ToolSet }>();
const authConfigIdCache = new Map<
  ComposioToolkit,
  { expiresAt: number; authConfigId: string }
>();
const toolsInflight = new Map<
  string,
  Promise<{ sessionId: string; tools: ToolSet }>
>();

const getSessionCacheKey = (userId: string) => `user:${userId}`;

const resolveStoredSessionId = async (
  userId: string,
  options: Pick<
    CreateComposioSessionOptions,
    "skipStoredSessionRead" | "userComposioSessionId"
  > = {}
) => {
  const cacheKey = getSessionCacheKey(userId);
  return (
    sessionIdCache.get(cacheKey) ??
    options.userComposioSessionId ??
    (options.skipStoredSessionRead
      ? undefined
      : await readStoredSessionId(userId))
  );
};

const readStoredSessionId = async (
  userId: string
): Promise<string | undefined> => {
  const db = getAdminFirestore();
  if (!db) {
    return undefined;
  }

  try {
    const snapshot = await db.doc(`users/${userId}`).get();
    const sessionId = snapshot.get(COMPOSIO_SESSION_FIELD);
    return typeof sessionId === "string" ? sessionId : undefined;
  } catch (error) {
    console.error(
      "Failed to read stored Composio session id:",
      error instanceof Error ? error.message : error
    );
    return undefined;
  }
};

const persistSessionId = async (userId: string, sessionId: string) => {
  const db = getAdminFirestore();
  if (!db) {
    return;
  }

  try {
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          [COMPOSIO_SESSION_FIELD]: sessionId,
          [COMPOSIO_SESSION_UPDATED_AT_FIELD]: new Date().toISOString(),
        },
        { merge: true }
      );
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
  const cacheKey = getSessionCacheKey(userId);

  const storedSessionId = await resolveStoredSessionId(userId, options);

  if (storedSessionId) {
    try {
      const session = await composio.use(storedSessionId);
      sessionIdCache.set(cacheKey, storedSessionId);
      return session;
    } catch (error) {
      // Session likely expired or was revoked; fall through to recreate it.
      sessionIdCache.delete(cacheKey);
      toolsCache.delete(storedSessionId);
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
  void persistSessionId(userId, session.sessionId);

  return session;
};

type ComposioSession = Awaited<ReturnType<typeof createComposioSession>>;

export const createComposioConnectionRequest = async ({
  userId,
  session,
  toolkit,
  authContext,
}: {
  userId: string;
  session: ComposioSession;
  toolkit: ComposioToolkit;
  authContext: NonNullable<GetComposioSessionToolsOptions["authContext"]>;
}) => {
  const callbackUrl = await createConnectionCallbackUrl({
    userId,
    toolkit,
    authContext,
  });

  try {
    return await createDirectComposioConnectionLink({
      userId,
      toolkit,
      callbackUrl,
    });
  } catch (error) {
    console.warn(
      "Direct Composio connection link failed, falling back to session.authorize:",
      error instanceof Error ? error.message : error
    );
    return session.authorize(toolkit, { callbackUrl });
  }
};

const createDirectComposioConnectionLink = async ({
  userId,
  toolkit,
  callbackUrl,
}: {
  userId: string;
  toolkit: ComposioToolkit;
  callbackUrl: string;
}) => {
  const authConfigId = await getManagedAuthConfigId(toolkit);
  const response = await composioApiFetch("/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: getComposioUserId(userId),
      callback_url: callbackUrl,
    }),
  });
  const payload = (await response.json()) as {
    redirect_url?: string;
    redirectUrl?: string;
    link_token?: string;
    connected_account_id?: string;
    expires_at?: string;
  };
  const redirectUrl = payload.redirect_url ?? payload.redirectUrl;

  if (!redirectUrl) {
    throw new Error("Composio direct link response did not include redirect_url");
  }

  return {
    ...payload,
    redirectUrl,
    connectLink: redirectUrl,
  };
};

const getManagedAuthConfigId = async (toolkit: ComposioToolkit) => {
  const cached = authConfigIdCache.get(toolkit);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.authConfigId;
  }

  const response = await composioApiFetch(
    `/auth_configs?toolkit_slug=${encodeURIComponent(
      toolkit
    )}&is_composio_managed=true`
  );
  const payload = (await response.json()) as {
    items?: Array<{
      id?: string;
      status?: string;
      is_enabled_for_tool_router?: boolean;
    }>;
  };
  const authConfig = payload.items?.find(
    (item) =>
      item.id &&
      item.status === "ENABLED" &&
      item.is_enabled_for_tool_router !== false
  );

  if (!authConfig?.id) {
    throw new Error(`No enabled Composio auth config found for ${toolkit}`);
  }

  authConfigIdCache.set(toolkit, {
    authConfigId: authConfig.id,
    expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS,
  });

  return authConfig.id;
};

const composioApiFetch = async (path: string, init: RequestInit = {}) => {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not configured");
  }

  const response = await fetch(`${COMPOSIO_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Composio API ${path} failed with ${response.status}${
        body ? `: ${body}` : ""
      }`
    );
  }

  return response;
};

/** Meta tools for a session; warm instances reuse a short-lived in-memory ToolSet. */
export const getComposioSessionTools = async (
  userId: string,
  options: GetComposioSessionToolsOptions = {}
): Promise<ToolSet> => {
  const cacheKey = getSessionCacheKey(userId);
  const storedSessionId = await resolveStoredSessionId(userId, options);

  if (storedSessionId) {
    const cached = toolsCache.get(storedSessionId);
    if (cached && cached.expiresAt > Date.now()) {
      sessionIdCache.set(cacheKey, storedSessionId);
      return withComposioRequestContext(cached.tools, {
        userId,
        sessionId: storedSessionId,
        authContext: options.authContext,
      });
    }
  }

  const inflight = toolsInflight.get(cacheKey);
  if (inflight) {
    const { sessionId, tools } = await inflight;
    return withComposioRequestContext(tools, {
      userId,
      sessionId,
      authContext: options.authContext,
    });
  }

  const promise = (async () => {
    const session = await createComposioSession(userId, options);
    const tools = getWrappedComposioTools(await session.tools());
    toolsCache.set(session.sessionId, {
      expiresAt: Date.now() + TOOLS_CACHE_TTL_MS,
      tools,
    });
    return { sessionId: session.sessionId, tools };
  })().finally(() => {
    toolsInflight.delete(cacheKey);
  });

  toolsInflight.set(cacheKey, promise);
  const { sessionId, tools } = await promise;
  return withComposioRequestContext(tools, {
    userId,
    sessionId,
    authContext: options.authContext,
  });
};

export const getWrappedComposioTools = (tools: ToolSet): ToolSet =>
  Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => [
      toolName,
      wrapComposioTool(toolName, tool),
    ])
  );

const withComposioRequestContext = (
  tools: ToolSet,
  context: {
    userId: string;
    sessionId: string;
    authContext?: GetComposioSessionToolsOptions["authContext"];
  }
): ToolSet =>
  Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => [
      toolName,
      toolName === COMPOSIO_MANAGE_CONNECTIONS_TOOL
        ? wrapManageConnectionsTool(tool, context)
        : tool,
    ])
  );

const wrapManageConnectionsTool = (
  tool: ToolSet[string],
  context: {
    userId: string;
    sessionId: string;
    authContext?: GetComposioSessionToolsOptions["authContext"];
  }
) => {
  const { authContext } = context;

  if (
    !authContext ||
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
        const toolkits = getToolkitsFromManageConnectionsArgs(args);

        if (toolkits.length === 0) {
          return await executableTool.execute(...args);
        }

        return await manageConnectionsForRequest(toolkits, {
          userId: context.userId,
          sessionId: context.sessionId,
          authContext,
        });
      } catch (error) {
        const message = getComposioErrorMessage(error);
        console.error(
          "Composio manage-connections wrapper failed:",
          message,
          error
        );
        return {
          ok: false,
          error: "connection_management_failed",
          tool: COMPOSIO_MANAGE_CONNECTIONS_TOOL,
          message,
          fallback:
            "Unable to create a connection link. Ask the user to connect the app from the Apps page.",
        };
      }
    },
  };
};

const manageConnectionsForRequest = async (
  toolkits: ComposioToolkit[],
  context: {
    userId: string;
    sessionId: string;
    authContext: NonNullable<GetComposioSessionToolsOptions["authContext"]>;
  }
) => {
  const session = await createComposioClient().use(context.sessionId);
  const { items } = await session.toolkits({
    toolkits,
    limit: toolkits.length,
  });
  const toolkitsBySlug = new Map(items.map((item) => [item.slug, item]));
  const results = await Promise.all(
    toolkits.map(async (toolkit) => {
      const toolkitState = toolkitsBySlug.get(toolkit);

      if (toolkitState?.connection?.isActive) {
        return {
          toolkit,
          name: COMPOSIO_TOOLKIT_LABELS[toolkit],
          isConnected: true,
          connectedAccountId: toolkitState.connection.connectedAccount?.id,
          status: toolkitState.connection.connectedAccount?.status,
        };
      }

      const connectionRequest = await createComposioConnectionRequest({
        userId: context.userId,
        session,
        toolkit,
        authContext: context.authContext,
      });

      return {
        toolkit,
        name: COMPOSIO_TOOLKIT_LABELS[toolkit],
        isConnected: false,
        status: "needs_connection",
        redirectUrl: connectionRequest.redirectUrl,
        connectLink: connectionRequest.redirectUrl,
      };
    })
  );

  return {
    ok: true,
    tool: COMPOSIO_MANAGE_CONNECTIONS_TOOL,
    results,
    message:
      "Connection status checked. Share any connectLink with the user if a toolkit needs connection.",
  };
};

const createConnectionCallbackUrl = async ({
  userId,
  toolkit,
  authContext,
}: {
  userId: string;
  toolkit: ComposioToolkit;
  authContext: NonNullable<GetComposioSessionToolsOptions["authContext"]>;
}) => {
  const intent = await createComposioAuthIntent({
    userId,
    source: authContext.source,
    threadId: authContext.threadId,
    toolkit,
  });

  if (intent) {
    const callbackUrl = new URL("/api/composio/callback", authContext.baseUrl);
    callbackUrl.searchParams.set("intentId", intent.id);
    return callbackUrl.toString();
  }

  if (authContext.source === "chat" && authContext.threadId) {
    return `${authContext.baseUrl}/chat/${encodeURIComponent(
      authContext.threadId
    )}?composioAuth=complete`;
  }

  if (authContext.source === "automations") {
    return `${authContext.baseUrl}/automations?composioAuth=complete`;
  }

  return `${authContext.baseUrl}/apps?composioAuth=complete`;
};

const getToolkitsFromManageConnectionsArgs = (
  args: unknown[]
): ComposioToolkit[] => {
  const candidates = new Set<string>();

  for (const arg of args) {
    collectToolkitCandidates(arg, candidates);
  }

  return Array.from(candidates)
    .map(resolveComposioToolkit)
    .filter((toolkit): toolkit is ComposioToolkit => Boolean(toolkit))
    .filter((toolkit, index, toolkits) => toolkits.indexOf(toolkit) === index)
    .slice(0, 5);
};

const TOOLKIT_KEYS = new Set([
  "app",
  "appSlug",
  "app_slug",
  "slug",
  "toolkit",
  "toolkitSlug",
  "toolkit_slug",
  "toolkitSlugs",
  "toolkit_slugs",
  "toolkitName",
  "toolkit_name",
  "tool",
  "toolSlug",
  "tool_slug",
  "appName",
  "app_name",
]);

const TOOLKITS_KEYS = new Set(["apps", "toolkits"]);

const collectToolkitCandidates = (
  value: unknown,
  candidates: Set<string>
) => {
  if (typeof value === "string") {
    candidates.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolkitCandidates(item, candidates);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (TOOLKIT_KEYS.has(key)) {
      collectToolkitCandidates(nestedValue, candidates);
      continue;
    }

    if (TOOLKITS_KEYS.has(key)) {
      collectToolkitCandidates(nestedValue, candidates);
      continue;
    }

    collectToolkitCandidates(nestedValue, candidates);
  }
};

const resolveComposioToolkit = (candidate: string) => {
  const normalized = normalizeToolkitCandidate(candidate);
  return COMPOSIO_TOOLKITS.find((toolkit) => {
    const normalizedToolkit = normalizeToolkitCandidate(toolkit);
    const normalizedLabel = normalizeToolkitCandidate(
      COMPOSIO_TOOLKIT_LABELS[toolkit]
    );

    return (
      normalized === normalizedToolkit ||
      normalized === normalizedToolkit.replace(/_/g, "") ||
      normalized === normalizedLabel ||
      normalized === normalizedLabel.replace(/_/g, "")
    );
  });
};

const normalizeToolkitCandidate = (value: string) =>
  value.trim().toLowerCase().replace(/[\s-]+/g, "_");

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
