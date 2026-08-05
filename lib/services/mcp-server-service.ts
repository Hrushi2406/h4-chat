import {
  type Timestamp,
} from "firebase/firestore";
import { auth } from "@/lib/clients/firebase";
import {
  normalizeMcpHeaders,
  type StoredMcpServer,
} from "@/lib/types/mcp-server";

const getAuthToken = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in is required");
  return token;
};

const readError = async (response: Response) => {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;
  return body?.error || "MCP server request failed";
};

const normalizeDate = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as Timestamp).toDate === "function"
  ) {
    return (value as Timestamp).toDate().toISOString();
  }

  return undefined;
};

const normalizeMcpServer = (
  id: string,
  value: Record<string, unknown>,
): StoredMcpServer | undefined => {
  const url = typeof value.url === "string" ? value.url : undefined;

  if (!url) {
    return undefined;
  }

  return {
    id,
    name: typeof value.name === "string" ? value.name : id,
    url,
    transport: value.transport === "sse" ? "sse" : "http",
    headers: normalizeMcpHeaders(value.headers),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    createdAt: normalizeDate(value.createdAt),
    updatedAt: normalizeDate(value.updatedAt),
  };
};

const removeUndefinedValues = <T>(value: T): T => {
  if (value === undefined) {
    return undefined as T;
  }

  if (value === null || value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedValues(item)) as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)]),
    ) as T;
  }

  return value;
};

class McpServerService {
  async getServers(uid: string): Promise<StoredMcpServer[]> {
    if (!uid) return [];
    const response = await fetch("/api/mcp-servers", {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as {
      servers?: Array<Record<string, unknown> & { id: string }>;
    };

    return (body.servers ?? [])
      .map((item) =>
        normalizeMcpServer(item.id, item),
      )
      .filter((server): server is StoredMcpServer => Boolean(server))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveServer(uid: string, server: StoredMcpServer) {
    if (!uid) throw new Error("Sign in is required");
    const response = await fetch("/api/mcp-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authToken: await getAuthToken(),
        server: removeUndefinedValues(server),
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
  }

  async updateServer(
    uid: string,
    serverId: string,
    update: Partial<StoredMcpServer>,
  ) {
    if (!uid) throw new Error("Sign in is required");
    const response = await fetch("/api/mcp-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authToken: await getAuthToken(),
        serverId,
        update: removeUndefinedValues(update),
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
  }

  async deleteServer(uid: string, serverId: string) {
    if (!uid) throw new Error("Sign in is required");
    const response = await fetch("/api/mcp-servers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authToken: await getAuthToken(),
        serverId,
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
  }
}

const mcpServerService = new McpServerService();
export default mcpServerService;
