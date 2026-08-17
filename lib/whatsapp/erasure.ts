import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, getAdminStorage } from "@/lib/clients/firebase-admin";

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
  const allUserThreads = await db.collection("threads").where("userId", "==", input.userId).get();
  const threads = allUserThreads.docs;
  const threadIds = new Set(threads.map((document) => document.id));
  const inboxGroups = await Promise.all(
    phones.map((phone) => db.collection("whatsappInbox").where("from", "==", phone).get()),
  );
  const outboxGroups = await Promise.all(
    phones.map((phone) => db.collection("whatsappOutbox").where("to", "==", phone).get()),
  );
  const [linkIntents, pendingActions, composioIntents, mergedSources, rechargeNotifications, creditDeficits, billingDeductions] = await Promise.all([
    db.collection("whatsappLinkIntents").where("userId", "==", input.userId).get(),
    db.collection("whatsappPendingActions").where("userId", "==", input.userId).get(),
    db.collection("composioAuthIntents").where("userId", "==", input.userId).get(),
    db.collection("users").where("mergedInto", "==", input.userId).get(),
    db.collection("whatsappRechargeNotifications").where("userId", "==", input.userId).get(),
    db.collection("whatsappCreditDeficits").where("userId", "==", input.userId).get(),
    db.collection("billingDeductions").where("userId", "==", input.userId).get(),
  ]);
  const documents = [
    ...accounts.docs,
    ...threads,
    ...inboxGroups.flatMap((snapshot) => snapshot.docs),
    ...outboxGroups.flatMap((snapshot) => snapshot.docs),
    ...linkIntents.docs,
    ...pendingActions.docs,
    ...rechargeNotifications.docs,
    ...creditDeficits.docs,
    ...billingDeductions.docs,
    ...composioIntents.docs.filter((document) => {
      const threadId = document.data().threadId;
      return typeof threadId === "string" && threadIds.has(threadId);
    }),
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
    for (const source of mergedSources.docs) {
      await storage.bucket().deleteFiles({ prefix: `users/${source.id}/whatsapp/` });
    }
  }
  const auth = getAdminAuth();
  if (auth) {
    await auth.updateUser(input.userId, { phoneNumber: null }).catch((error) => {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    });
  }
  for (const source of mergedSources.docs) {
    await source.ref.set(
      {
        phoneNumber: FieldValue.delete(),
        whatsappConnected: FieldValue.delete(),
        whatsappErasedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    if (auth) {
      await auth.updateUser(source.id, { phoneNumber: null, disabled: true }).catch((error) => {
        if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
      });
    }
  }
  return { deletedRecords: documents.length, phoneMappings: phones.length };
};
