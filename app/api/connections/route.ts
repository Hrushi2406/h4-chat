import {
  COMPOSIO_TOOLKIT_LABELS,
  COMPOSIO_TOOLKITS,
  createComposioSession,
  isComposioConfigured,
  isSupportedComposioToolkit,
} from "@/lib/composio";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isComposioConfigured()) {
    return Response.json(
      { error: "Composio is not configured", toolkits: [] },
      { status: 503 }
    );
  }

  const userId = await verifyFirebaseIdToken(
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  );

  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  const session = await createComposioSession(userId);
  const { items } = await session.toolkits({
    toolkits: [...COMPOSIO_TOOLKITS],
    limit: COMPOSIO_TOOLKITS.length,
  });

  return Response.json({
    toolkits: items.map((toolkit) => ({
      slug: toolkit.slug,
      name:
        COMPOSIO_TOOLKIT_LABELS[
          toolkit.slug as keyof typeof COMPOSIO_TOOLKIT_LABELS
        ] ?? toolkit.name,
      providerName: toolkit.name,
      logo: toolkit.logo,
      isConnected: toolkit.connection?.isActive ?? false,
      connectedAccountId: toolkit.connection?.connectedAccount?.id,
      status: toolkit.connection?.connectedAccount?.status,
    })),
  });
}

export async function POST(req: Request) {
  if (!isComposioConfigured()) {
    return Response.json(
      { error: "Composio is not configured" },
      { status: 503 }
    );
  }

  const {
    authToken,
    toolkit,
  }: {
    authToken?: string;
    toolkit?: string;
  } = await req.json();
  const userId = await verifyFirebaseIdToken(authToken);

  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!toolkit || !isSupportedComposioToolkit(toolkit)) {
    return Response.json({ error: "Unsupported toolkit" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const session = await createComposioSession(userId);
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: `${origin}/settings?tab=connections`,
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
