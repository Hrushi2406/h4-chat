import { z } from "zod";
import {
  COMPOSIO_TOOLKITS,
  createComposioSession,
  isComposioConfigured,
} from "@/lib/composio";
import { getConnectionLimitForUser } from "@/lib/billing/server";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";
import { invalidateUserMcpServersCache } from "@/lib/mcp-firestore";

export const dynamic = "force-dynamic";

const serverSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  url: z.string().url().max(2_000),
  transport: z.enum(["http", "sse"]),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean(),
  createdAt: z.string().optional(),
});

const saveSchema = z.object({
  authToken: z.string().min(1),
  server: serverSchema,
});

const updateSchema = z.object({
  authToken: z.string().min(1),
  serverId: z.string().trim().min(1).max(100),
  update: serverSchema.partial().omit({ id: true }),
});

const deleteSchema = z.object({
  authToken: z.string().min(1),
  serverId: z.string().trim().min(1).max(100),
});

const getDb = () => {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin is not configured");
  return db;
};

export async function GET(request: Request) {
  try {
    const userId = await verifyFirebaseIdToken(
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    );
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }
    const snapshot = await getDb()
      .collection("users")
      .doc(userId)
      .collection("mcpServers")
      .get();
    return Response.json({
      servers: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid MCP server" }, { status: 400 });
    }
    const userId = await verifyFirebaseIdToken(parsed.data.authToken);
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }
    if (parsed.data.server.enabled) {
      await assertConnectionSlot(userId, parsed.data.server.id);
    }
    const now = new Date().toISOString();
    const ref = getDb()
      .collection("users")
      .doc(userId)
      .collection("mcpServers")
      .doc(parsed.data.server.id);
    const existing = await ref.get();
    await ref.set(
      {
        ...parsed.data.server,
        createdAt: existing.data()?.createdAt ?? parsed.data.server.createdAt ?? now,
        updatedAt: now,
      },
      { merge: true },
    );
    invalidateUserMcpServersCache(userId);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid MCP server update" }, { status: 400 });
    }
    const userId = await verifyFirebaseIdToken(parsed.data.authToken);
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }
    if (parsed.data.update.enabled === true) {
      await assertConnectionSlot(userId, parsed.data.serverId);
    }
    await getDb()
      .collection("users")
      .doc(userId)
      .collection("mcpServers")
      .doc(parsed.data.serverId)
      .update({
        ...parsed.data.update,
        updatedAt: new Date().toISOString(),
      });
    invalidateUserMcpServersCache(userId);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid MCP server" }, { status: 400 });
    }
    const userId = await verifyFirebaseIdToken(parsed.data.authToken);
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }
    await getDb()
      .collection("users")
      .doc(userId)
      .collection("mcpServers")
      .doc(parsed.data.serverId)
      .delete();
    invalidateUserMcpServersCache(userId);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function assertConnectionSlot(userId: string, excludingServerId: string) {
  const limit = await getConnectionLimitForUser(userId);
  if (limit === null) return;

  const mcpSnapshot = await getDb()
    .collection("users")
    .doc(userId)
    .collection("mcpServers")
    .get();
  const enabledMcpCount = mcpSnapshot.docs.filter(
    (doc) => doc.id !== excludingServerId && doc.data().enabled !== false,
  ).length;
  let composioCount = 0;
  if (isComposioConfigured()) {
    const session = await createComposioSession(userId);
    const result = await session.toolkits({
      toolkits: [...COMPOSIO_TOOLKITS],
      limit: COMPOSIO_TOOLKITS.length,
    });
    composioCount = result.items.filter(
      (toolkit) => !toolkit.isNoAuth && toolkit.connection?.isActive,
    ).length;
  }

  if (enabledMcpCount + composioCount >= limit) {
    throw new Error(
      `Your plan allows ${limit} connected apps. Disable one or upgrade your plan.`,
    );
  }
}

function errorResponse(error: unknown) {
  console.error("MCP server API failed:", error);
  const message =
    error instanceof Error ? error.message : "MCP server request failed";
  return Response.json(
    { error: message },
    { status: message.includes("plan allows") ? 403 : 500 },
  );
}
