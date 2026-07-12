import {
  addDoc,
  collection,
  getDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/clients/firebase";

export type PromptLinkMode = "draft" | "prompt";

export interface PromptLink {
  text: string;
  mode: PromptLinkMode;
}

const collectionName = "promptLinks";

export async function createPromptLink(link: PromptLink): Promise<string> {
  const document = await addDoc(collection(db, collectionName), {
    ...link,
    createdAt: serverTimestamp(),
  });
  return document.id;
}

export async function getPromptLink(id: string): Promise<PromptLink | null> {
  const snapshot = await getDoc(doc(db, collectionName, id));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  if (
    typeof data.text !== "string" ||
    (data.mode !== "draft" && data.mode !== "prompt")
  ) {
    return null;
  }

  return { text: data.text, mode: data.mode };
}
