import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminStorage } from "@/lib/clients/firebase-admin";

/**
 * Operator-only support primitive. Call only after the requester has been
 * verified through the documented privacy-request workflow.
 */
export const eraseWhatsAppDataForUser = async (input: {
  userId: string;
  verifiedBy: string;
}) => {
  if (!input.userId || !input.verifiedBy) {
    throw new Error("Verified user and operator identities are required");
  }
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin is not configured");
  const accounts = await db.collection("whatsappAccounts").where("userId", "==", input.userId).get();
  const phones = accounts.docs.map((document) => document.id);
  const threads = await db.collection("threads").where("userId", "==", input.userId).get();
  const inboxGroups = await Promise.all(
    phones.map((phone) => db.collection("whatsappInbox").where("from", "==", phone).get()),
  );
  const outboxGroups = await Promise.all(
    phones.map((phone) => db.collection("whatsappOutbox").where("to", "==", phone).get()),
  );
  const documents = [
    ...accounts.docs,
    ...threads.docs,
    ...inboxGroups.flatMap((snapshot) => snapshot.docs),
    ...outboxGroups.flatMap((snapshot) => snapshot.docs),
  ];
  for (let index = 0; index < documents.length; index += 400) {
    const batch = db.batch();
    for (const document of documents.slice(index, index + 400)) batch.delete(document.ref);
    await batch.commit();
  }
  await db.collection("users").doc(input.userId).set(
    {
      phoneNumber: FieldValue.delete(),
      whatsappConnected: FieldValue.delete(),
      memories: [],
      whatsappErasedAt: new Date().toISOString(),
      whatsappErasedBy: input.verifiedBy,
    },
    { merge: true },
  );
  const storage = getAdminStorage();
  if (storage) {
    await storage.bucket().deleteFiles({ prefix: `users/${input.userId}/whatsapp/` });
  }
  return { deletedRecords: documents.length, phoneMappings: phones.length };
};
