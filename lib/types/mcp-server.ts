export type McpTransport = "http" | "sse";

export type StoredMcpServer = {
  id: string;
  name: string;
  url: string;
  transport: McpTransport;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const slugifyMcpId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

export const normalizeMcpHeaders = (value: unknown) => {
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

export const parseMcpHeadersJson = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return normalizeMcpHeaders(JSON.parse(trimmed)) ?? {};
  } catch {
    return null;
  }
};
