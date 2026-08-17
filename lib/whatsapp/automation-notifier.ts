import "server-only";

import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { shouldNotifyAutomationOnWhatsApp } from "@/lib/whatsapp/policy";
import { WhatsAppStore } from "@/lib/whatsapp/store";
import type { ScheduledTaskRun } from "@/lib/types/scheduled-task";

export interface AutomationWhatsAppNotification {
  status: NonNullable<ScheduledTaskRun["whatsappNotificationStatus"]>;
  messageId?: string;
  error?: string;
}

export const notifyAutomationOnWhatsApp = async (input: {
  userId: string;
  enabled: boolean;
  title: string;
  outputPreview: string;
  threadUrl: string;
  now?: Date;
}): Promise<AutomationWhatsAppNotification> => {
  if (!input.enabled) return { status: "skipped_disabled" };
  const store = new WhatsAppStore();
  const account = await store.getAccountByUser(input.userId);
  if (!account || account.optedOut || account.blocked) {
    return { status: "skipped_not_connected" };
  }
  if (!shouldNotifyAutomationOnWhatsApp(true, account.lastInboundAt, input.now)) {
    return { status: "skipped_outside_window" };
  }
  let meta: MetaWhatsAppClient;
  try {
    meta = new MetaWhatsAppClient(getWhatsAppConfig());
  } catch {
    return { status: "skipped_not_configured" };
  }
  try {
    const result = await meta.sendText(
      account.phoneNumber,
      `Automation finished: ${input.title}\n\n${input.outputPreview}\n\nOpen result: ${input.threadUrl}`,
    );
    await store.recordOutbound({
      messageId: result.messageId,
      to: account.phoneNumber,
      kind: "automation_completed",
    });
    return { status: "sent", messageId: result.messageId };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error",
    };
  }
};
