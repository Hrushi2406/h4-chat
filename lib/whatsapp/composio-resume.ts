import "server-only";

import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { processWhatsAppMessage } from "@/lib/whatsapp/processor";
import { WhatsAppStore } from "@/lib/whatsapp/store";

export const resumeWhatsAppAfterConnectedAppAuth = async (
  threadId: string,
  baseUrl: string,
  messageId?: string,
  userId?: string,
) => {
  const store = new WhatsAppStore();
  const target = await store.getResumeTargetForThread(threadId, messageId, userId);
  if (!target || !(await store.resetInboundForRetry(target.messageId))) return false;
  const meta = new MetaWhatsAppClient(getWhatsAppConfig());
  const notice = await meta.sendText(
    target.phoneNumber,
    "Connected. Continuing your pending Sakhi task now.",
  );
  await store.recordOutbound({
    messageId: notice.messageId,
    to: target.phoneNumber,
    threadId,
    inboundMessageId: target.messageId,
    kind: "connected_app_resume",
  });
  await processWhatsAppMessage(target.messageId, { store, meta, baseUrl });
  return true;
};
