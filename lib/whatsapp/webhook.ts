import { parseMetaWebhook } from "@/lib/whatsapp/payload";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import type {
  WhatsAppClaimedWork,
  WhatsAppInboundAcceptance,
  WhatsAppStore,
} from "@/lib/whatsapp/store";
import { measureWhatsAppStage } from "@/lib/whatsapp/timing";

interface WebhookDependencies {
  verifyToken: string;
  appSecret: string;
  phoneNumberId: string;
  store: Pick<WhatsAppStore, "acceptInbound" | "recordStatus">;
  acknowledge?: (messageId: string) => Promise<unknown>;
  schedule: (callback: () => void | Promise<void>) => void;
  process: (messageId: string, work?: WhatsAppClaimedWork) => Promise<void>;
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
    const acceptedWork: Array<{ messageId: string; work?: WhatsAppClaimedWork }> = [];
    for (const message of parsed.messages) {
      if (message.phoneNumberId !== dependencies.phoneNumberId) continue;
      void measureWhatsAppStage(
        message.id,
        "webhook.mark_read_and_typing",
        async () => dependencies.acknowledge?.(message.id),
      ).catch((error) => {
        console.error("Non-fatal WhatsApp read receipt failure", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      const acceptance = await measureWhatsAppStage(
        message.id,
        "webhook.accept_inbound",
        () => dependencies.store.acceptInbound(message),
      ) as WhatsAppInboundAcceptance | boolean;
      const accepted = typeof acceptance === "boolean" ? acceptance : acceptance.accepted;
      const work = typeof acceptance === "boolean" ? undefined : acceptance.work;
      if (accepted && (work || typeof acceptance === "boolean")) {
        acceptedWork.push({ messageId: message.id, work });
      }
    }
    await Promise.all(parsed.statuses.map((status) => measureWhatsAppStage(
      status.messageId,
      `webhook.record_status.${status.status}`,
      () => dependencies.store.recordStatus(status),
    )));
    if (acceptedWork.length > 0) {
      dependencies.schedule(async () => {
        for (const { messageId, work } of acceptedWork) {
          try {
            await measureWhatsAppStage(
              messageId,
              "webhook.process_inbound",
              () => work
                ? dependencies.process(messageId, work)
                : dependencies.process(messageId),
            );
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
