import {
  createComposioClient,
  getComposioUserId,
  isComposioConfigured,
} from "@/lib/composio";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export async function POST(req: Request) {
  if (!isComposioConfigured()) {
    return Response.json(
      { error: "Composio is not configured" },
      { status: 503 }
    );
  }

  const {
    authToken,
    connectedAccountId,
  }: {
    authToken?: string;
    connectedAccountId?: string;
  } = await req.json();
  const userId = await verifyFirebaseIdToken(authToken);

  if (!userId) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!connectedAccountId) {
    return Response.json(
      { error: "Missing connectedAccountId" },
      { status: 400 }
    );
  }

  const composio = createComposioClient();
  const account = (await composio.connectedAccounts.get(
    connectedAccountId
  )) as { userId?: string };

  if (account.userId && account.userId !== getComposioUserId(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await composio.connectedAccounts.delete(connectedAccountId);

  return Response.json({ success: true });
}
