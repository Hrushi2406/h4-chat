import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import type { McpServerInput } from "@/lib/mcp";
import { normalizeMcpHeaders } from "@/lib/types/mcp-server";

// The MCP server list rarely changes, so cache per user for a short window to
// keep it off the hot path of every chat request. Fluid Compute reuses
// function instances, so this cache survives across requests on a warm instance.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: number; servers: McpServerInput[] }>();

export const getUserMcpServersFromFirestore = async ({
  userId,
}: {
  userId?: string;
}): Promise<McpServerInput[]> => {
  if (!userId) {
    return [];
  }

  const cached = cache.get(userId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.servers;
  }

  const db = getAdminFirestore();

  if (!db) {
    return [];
  }

  try {
    const snapshot = await db.collection(`users/${userId}/mcpServers`).get();

    const servers = snapshot.docs
      .map((doc): McpServerInput | undefined => {
        const data = doc.data();
        const id = typeof data.id === "string" ? data.id : doc.id;
        const url = typeof data.url === "string" ? data.url : undefined;

        if (!id || !url) {
          return undefined;
        }

        return {
          id,
          name: typeof data.name === "string" ? data.name : undefined,
          url,
          transport: data.transport === "sse" ? "sse" : "http",
          headers: normalizeMcpHeaders(data.headers),
          enabled: typeof data.enabled === "boolean" ? data.enabled : true,
        };
      })
      .filter((server): server is McpServerInput => Boolean(server))
      .filter((server) => server.enabled !== false);

    cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, servers });

    return servers;
  } catch (error) {
    console.error(
      "Failed to load MCP servers from Firestore:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
};
