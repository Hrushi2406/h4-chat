import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { MetaWhatsAppClient } from "@/lib/whatsapp/meta-client";
import { shouldNotifyAutomationOnWhatsApp } from "@/lib/whatsapp/policy";
import { WhatsAppStore } from "@/lib/whatsapp/store";

const configured = () =>
  ["WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"]
    .every((name) => Boolean(process.env[name]?.trim()));

export const notifyRechargeOnWhatsApp = async (input: {
  userId: string;
  orderId: string;
  credits: number;
}) => {
  if (!configured()) return { status: "skipped_not_configured" as const };
  const database = getAdminFirestore();
  if (!database) return { status: "skipped_not_configured" as const };
  const notificationRef = database.collection("whatsappRechargeNotifications").doc(input.orderId);
  const claimed = await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(notificationRef);
    if (snapshot.data()?.status === "sent") return false;
    const startedAt = snapshot.data()?.startedAt instanceof Timestamp
      ? snapshot.data()!.startedAt.toDate()
      : undefined;
    if (snapshot.data()?.status === "sending" && startedAt && Date.now() - startedAt.getTime() < 60_000) {
      return false;
    }
    transaction.set(notificationRef, {
      ...input,
      status: "sending",
      startedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true });
    return true;
  });
  if (!claimed) return { status: "duplicate" as const };

  try {
    const store = new WhatsAppStore();
    const account = await store.getAccountByUser(input.userId);
    if (
      !account ||
      account.optedOut ||
      account.blocked ||
      !shouldNotifyAutomationOnWhatsApp(true, account.lastInboundAt)
    ) {
      await notificationRef.set({ status: "skipped", updatedAt: Timestamp.now() }, { merge: true });
      return { status: "skipped" as const };
    }
    const meta = new MetaWhatsAppClient(getWhatsAppConfig());
    const result = await meta.sendButtons(
      account.phoneNumber,
      `${input.credits.toLocaleString("en-IN")} Sakhi credits were added successfully. Tap Retry to continue your last unfinished request.`,
      [{ id: "retry", title: "Retry" }],
    );
    await store.recordOutbound({
      messageId: result.messageId,
      to: account.phoneNumber,
      kind: "recharge_confirmed",
    });
    await notificationRef.set({
      status: "sent",
      messageId: result.messageId,
      sentAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true });
    return { status: "sent" as const, messageId: result.messageId };
  } catch (error) {
    await notificationRef.set({
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      updatedAt: Timestamp.now(),
    }, { merge: true });
    return { status: "failed" as const };
  }
};
