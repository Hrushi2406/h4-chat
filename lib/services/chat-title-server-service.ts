import { generateText } from "ai";
import { getDefaultModel } from "@/lib/available-models";
import {
  normalizeGeneratedChatTitle,
  truncateTitleSource,
} from "@/lib/chat-title";

/**
 * Sidebar title for a thread, derived from its first user message. Shared by the
 * web chat route and the WhatsApp processor so both channels title threads the
 * same way.
 */
export const generateChatTitleFromFirstMessage = async (
  firstMessage: string,
) => {
  const source = truncateTitleSource(firstMessage);
  const result = await generateText({
    model: getDefaultModel().id,
    system:
      "You generate concise chat sidebar titles. Return only the title, with no quotes or extra text.",
    prompt: `Generate a concise title for this chat based only on the first user message.\n\nRules:\n- 2 to 6 words\n- Clearly describe the topic or user intent\n- No quotes\n- No emojis\n- No trailing punctuation\n- Not a full sentence\n- Return only the title\n\nFirst user message:\n${source}`,
  });

  return normalizeGeneratedChatTitle(result.text, source);
};
