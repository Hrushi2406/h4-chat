import { after } from "next/server";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { processWhatsAppMessage } from "@/lib/whatsapp/processor";
import { WhatsAppStore } from "@/lib/whatsapp/store";
import { createWhatsAppWebhookHandlers } from "@/lib/whatsapp/webhook";

export const runtime = "nodejs";
export const maxDuration = 600;

const handlers = () => {
  const config = getWhatsAppConfig();
  const store = new WhatsAppStore();
  const meta = new MetaWhatsAppClient(config);
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    "https://trysakhi.com"
  ).replace(/\/$/, "");
  return createWhatsAppWebhookHandlers({
    verifyToken: config.verifyToken,
    appSecret: config.appSecret,
    store,
    schedule: after,
    process: (messageId) => processWhatsAppMessage(messageId, { store, meta, baseUrl }),
  });
};

export const GET = (request: Request) => handlers().GET(request);
export const POST = (request: Request) => handlers().POST(request);
