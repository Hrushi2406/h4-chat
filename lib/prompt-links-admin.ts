import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

export type PromptLinkMode = "draft" | "prompt";

export async function createPromptLink({
  text,
  mode,
  userId,
}: {
  text: string;
  mode: PromptLinkMode;
  userId: string;
}) {
  const firestore = getAdminFirestore();
  if (!firestore) throw new Error("Firestore is unavailable");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomBytes(6).toString("base64url");
    try {
      await firestore.collection("promptLinks").doc(code).create({
        text,
        mode,
        createdBy: userId,
        createdAt: FieldValue.serverTimestamp(),
      });
      return code;
    } catch (error) {
      const code = (error as { code?: number | string }).code;
      if (code !== 6 && code !== "already-exists") throw error;
    }
  }

  throw new Error("Could not generate a unique prompt link");
}
