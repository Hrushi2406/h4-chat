import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

type McpTransport = "http" | "sse";

type McpServerConfig = {
  id: string;
  name?: string;
  url: string;
  transport?: McpTransport;
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type McpServerInput = {
  id: string;
  name?: string;
  url: string;
  transport?: McpTransport;
  headers?: Record<string, string>;
  enabled?: boolean;
};

type McpToolContext = {
  tools: ToolSet;
  clients: MCPClient[];
  servers: Array<{
    id: string;
    name: string;
    instructions?: string;
    toolNames: string[];
  }>;
};

const ZEPTO_SERVER_ID = "zepto";

export const getConfiguredMcpServers = (
  requestServers: McpServerInput[] = []
): McpServerConfig[] => {
  const servers = [
    ...parseMcpServersJson(process.env.MCP_SERVERS_JSON),
    ...getZeptoMcpServerConfig(),
    ...requestServers
      .map(normalizeMcpServerConfig)
      .filter((server): server is McpServerConfig => Boolean(server)),
  ];

  const seen = new Set<string>();

  return servers
    .filter((server) => server.enabled !== false)
    .filter((server) => {
      if (!server.id || !server.url || seen.has(server.id)) {
        return false;
      }

      seen.add(server.id);
      return true;
    });
};

export const isMcpConfigured = () => getConfiguredMcpServers().length > 0;

export const createMcpToolContext = async (
  userId?: string,
  requestServers: McpServerInput[] = []
): Promise<
  McpToolContext | undefined
> => {
  if (!userId && process.env.MCP_ALLOW_UNAUTHENTICATED !== "true") {
    return undefined;
  }

  const configs = getConfiguredMcpServers(requestServers);

  if (configs.length === 0) {
    return undefined;
  }

  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const servers: McpToolContext["servers"] = [];

  for (const config of configs) {
    try {
      const client = await createMCPClient({
        clientName: "h4-chat",
        version: "0.1.0",
        transport: {
          type: config.transport ?? "http",
          url: config.url,
          headers: config.headers,
          redirect: "error",
        },
        onUncaughtError: (error) => {
          console.error(`MCP uncaught error (${config.id}):`, error);
        },
      });
      const serverTools = (await client.tools()) as unknown as ToolSet;
      const namespacedTools = namespaceTools(config.id, config.name, serverTools);

      Object.assign(tools, namespacedTools);
      clients.push(client);
      servers.push({
        id: config.id,
        name: config.name ?? config.id,
        instructions: client.instructions,
        toolNames: Object.keys(namespacedTools),
      });
    } catch (error) {
      console.error(`Failed to load MCP server (${config.id}):`, error);
    }
  }

  if (Object.keys(tools).length === 0) {
    await closeMcpClients(clients);
    return undefined;
  }

  return { tools, clients, servers };
};

export const closeMcpClients = async (clients: MCPClient[]) => {
  await Promise.allSettled(clients.map((client) => client.close()));
};

const parseMcpServersJson = (value?: string): McpServerConfig[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    const servers = Array.isArray(parsed) ? parsed : [parsed];

    return servers
      .map(normalizeMcpServerConfig)
      .filter((server): server is McpServerConfig => Boolean(server));
  } catch (error) {
    console.error("Invalid MCP_SERVERS_JSON:", error);
    return [];
  }
};

const normalizeMcpServerConfig = (value: unknown): McpServerConfig | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : undefined;
  const url = typeof value.url === "string" ? value.url : undefined;

  if (!id || !url) {
    return undefined;
  }

  return {
    id: sanitizeToolSegment(id),
    name: typeof value.name === "string" ? value.name : undefined,
    url,
    transport: value.transport === "sse" ? "sse" : "http",
    headers: normalizeHeaders(value.headers),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
  };
};

const getZeptoMcpServerConfig = (): McpServerConfig[] => {
  const url = process.env.MCP_ZEPTO_URL;

  if (!url) {
    return [];
  }

  return [
    {
      id: ZEPTO_SERVER_ID,
      name: "Zepto",
      url,
      transport: process.env.MCP_ZEPTO_TRANSPORT === "sse" ? "sse" : "http",
      headers: getZeptoHeaders(),
    },
  ];
};

const getZeptoHeaders = () => {
  const headers = normalizeHeadersFromJson(process.env.MCP_ZEPTO_HEADERS_JSON);
  const token = process.env.MCP_ZEPTO_AUTH_TOKEN;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
};

const normalizeHeadersFromJson = (value?: string) => {
  if (!value) {
    return {};
  }

  try {
    return normalizeHeaders(JSON.parse(value)) ?? {};
  } catch (error) {
    console.error("Invalid MCP headers JSON:", error);
    return {};
  }
};

const normalizeHeaders = (value: unknown) => {
  if (!isRecord(value)) {
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

const namespaceTools = (
  serverId: string,
  serverName: string | undefined,
  tools: ToolSet
): ToolSet => {
  const prefix = `mcp_${sanitizeToolSegment(serverId)}`;
  const displayName = serverName ?? serverId;

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => [
      `${prefix}_${sanitizeToolSegment(toolName)}`,
      {
        ...tool,
        description: `[${displayName} MCP] ${tool.description ?? toolName}`,
      },
    ])
  ) as ToolSet;
};

const sanitizeToolSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
