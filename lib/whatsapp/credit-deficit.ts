import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

export const recordWhatsAppCreditDeficit = async (input: {
  userId: string;
  threadId: string;
  modelId: string;
  messageId: string;
  consumedCredits: number;
  deductedCredits: number;
}) => {
  const deficit = Math.max(0, input.consumedCredits - input.deductedCredits);
  if (deficit === 0) return;
  const database = getAdminFirestore();
  if (!database) return;
  await database.collection("whatsappCreditDeficits").doc(input.messageId.replaceAll("/", "_")).set({
    ...input,
    deficitCredits: deficit,
    status: "unbilled",
    createdAt: Timestamp.now(),
  }, { merge: false });
};
