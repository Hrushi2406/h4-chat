export type BrowserMcpServer = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  headers?: Record<string, string>;
  enabled: boolean;
};

export const MCP_SERVERS_STORAGE_KEY = "h4-chat:mcp-servers";

export const getBrowserMcpServers = (): BrowserMcpServer[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(MCP_SERVERS_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeBrowserMcpServer)
      .filter((server): server is BrowserMcpServer => Boolean(server));
  } catch {
    return [];
  }
};

const normalizeBrowserMcpServer = (
  value: unknown
): BrowserMcpServer | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const server = value as Record<string, unknown>;
  const id = typeof server.id === "string" ? server.id : undefined;
  const url = typeof server.url === "string" ? server.url : undefined;

  if (!id || !url) {
    return undefined;
  }

  return {
    id,
    name: typeof server.name === "string" ? server.name : id,
    url,
    transport: server.transport === "sse" ? "sse" : "http",
    headers: normalizeHeaders(server.headers),
    enabled: typeof server.enabled === "boolean" ? server.enabled : true,
  };
};

const normalizeHeaders = (value: unknown) => {
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
