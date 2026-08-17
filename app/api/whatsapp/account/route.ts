import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";
import {
  createWhatsAppLinkToken,
  hashWhatsAppLinkToken,
} from "@/lib/whatsapp/link";
import { WhatsAppStore } from "@/lib/whatsapp/store";

export const dynamic = "force-dynamic";

const store = new WhatsAppStore();

const bearerToken = (request: Request) =>
  request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

export async function GET(request: Request) {
  const userId = await verifyFirebaseIdToken(bearerToken(request));
  if (!userId) return Response.json({ error: "Sign in is required" }, { status: 401 });
  return Response.json(await store.getConnectionForUser(userId), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { authToken?: string };
  const userId = await verifyFirebaseIdToken(body.authToken);
  if (!userId) return Response.json({ error: "Sign in is required" }, { status: 401 });
  const publicNumber = process.env.WHATSAPP_PUBLIC_NUMBER?.replace(/\D/g, "");
  if (!publicNumber) {
    return Response.json({ error: "WHATSAPP_PUBLIC_NUMBER is not configured" }, { status: 503 });
  }
  const token = createWhatsAppLinkToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);
  await store.createLinkIntent(userId, hashWhatsAppLinkToken(token), expiresAt);
  const message = `connect ${token}`;
  return Response.json({
    expiresAt: expiresAt.toISOString(),
    link: `https://wa.me/${publicNumber}?text=${encodeURIComponent(message)}`,
    message,
  });
}

export async function DELETE(request: Request) {
  const userId = await verifyFirebaseIdToken(bearerToken(request));
  if (!userId) return Response.json({ error: "Sign in is required" }, { status: 401 });
  await store.disconnectUser(userId);
  return Response.json({ disconnected: true });
}
