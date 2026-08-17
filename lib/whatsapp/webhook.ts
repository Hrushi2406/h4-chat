import { parseMetaWebhook } from "@/lib/whatsapp/payload";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import type { WhatsAppStore } from "@/lib/whatsapp/store";

interface WebhookDependencies {
  verifyToken: string;
  appSecret: string;
  store: Pick<WhatsAppStore, "acceptInbound" | "recordStatus">;
  schedule: (callback: () => void | Promise<void>) => void;
  process: (messageId: string) => Promise<void>;
}

export const createWhatsAppWebhookHandlers = (dependencies: WebhookDependencies) => ({
  GET: async (request: Request) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || token !== dependencies.verifyToken || !challenge) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(challenge, { status: 200 });
  },
  POST: async (request: Request) => {
    const rawBody = await request.text();
    if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), dependencies.appSecret)) {
      return Response.json({ received: false, error: "Invalid signature" }, { status: 401 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json({ received: false, error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = parseMetaWebhook(payload);
    const acceptedIds: string[] = [];
    for (const message of parsed.messages) {
      if (await dependencies.store.acceptInbound(message)) acceptedIds.push(message.id);
    }
    await Promise.all(parsed.statuses.map((status) => dependencies.store.recordStatus(status)));
    if (acceptedIds.length > 0) {
      dependencies.schedule(async () => {
        for (const messageId of acceptedIds) {
          try {
            await dependencies.process(messageId);
          } catch (error) {
            console.error("Unhandled WhatsApp background processing error", {
              messageId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
    }
    return Response.json({ received: true });
  },
});
