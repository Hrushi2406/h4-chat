import { generateText } from "ai";
import { getDefaultModel } from "@/lib/available-models";
import { normalizeGeneratedChatTitle, truncateTitleSource } from "@/lib/chat-title";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export async function POST(req: Request) {
  try {
    const { threadId, firstMessage, authToken } = await req.json();

    if (!threadId || typeof threadId !== "string") {
      return Response.json({ error: "threadId is required" }, { status: 400 });
    }

    if (!firstMessage || typeof firstMessage !== "string") {
      return Response.json({ error: "firstMessage is required" }, { status: 400 });
    }

    const userId = await verifyFirebaseIdToken(authToken);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminFirestore();
    if (!db) {
      return Response.json(
        { error: "Firestore admin is not configured" },
        { status: 500 },
      );
    }

    const threadRef = db.collection("threads").doc(threadId);
    const threadSnap = await threadRef.get();

    if (!threadSnap.exists) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    const thread = threadSnap.data();
    if (thread?.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (thread?.titleSource === "manual") {
      return Response.json({ title: thread.title, skipped: true });
    }

    const source = truncateTitleSource(firstMessage);
    const result = await generateText({
      model: getDefaultModel().id,
      system:
        "You generate concise chat sidebar titles. Return only the title, with no quotes or extra text.",
      prompt: `Generate a concise title for this chat based only on the first user message.\n\nRules:\n- 2 to 6 words\n- Clearly describe the topic or user intent\n- No quotes\n- No emojis\n- No trailing punctuation\n- Not a full sentence\n- Return only the title\n\nFirst user message:\n${source}`,
    });

    const title = normalizeGeneratedChatTitle(result.text, source);
    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(threadRef);
      const latestData = latest.data();

      if (!latest.exists || latestData?.userId !== userId) return;
      if (latestData?.titleSource === "manual") return;

      transaction.update(threadRef, {
        title,
        titleSource: "generated",
      });
    });

    return Response.json({ title });
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    return Response.json(
      { error: "Failed to generate chat title" },
      { status: 500 },
    );
  }
}
