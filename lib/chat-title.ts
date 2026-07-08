const FALLBACK_TITLE = "New Chat";
const MAX_TITLE_WORDS = 6;
const MAX_SOURCE_CHARS = 240;

export const buildFallbackChatTitle = (firstMessage: string) => {
  const cleaned = firstMessage
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return FALLBACK_TITLE;

  const words = cleaned.split(" ").slice(0, MAX_TITLE_WORDS);
  if (words.length === 1) words.push("Chat");
  return toTitleCase(words.join(" ")) || FALLBACK_TITLE;
};

export const normalizeGeneratedChatTitle = (
  rawTitle: string,
  firstMessage: string,
) => {
  const cleaned = rawTitle
    .split("\n")[0]
    .replace(/^title\s*:/i, "")
    .replace(/["“”'`]/g, "")
    .replace(/[.!?。]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter(Boolean);
  const title = words.slice(0, MAX_TITLE_WORDS).join(" ");

  if (words.length >= 2 && title.length >= 4) {
    return title;
  }

  return buildFallbackChatTitle(firstMessage);
};

export const truncateTitleSource = (value: string) =>
  value.trim().slice(0, MAX_SOURCE_CHARS);

const toTitleCase = (value: string) =>
  value.replace(/\S+/g, (word) =>
    word.length <= 2
      ? word.toLowerCase()
      : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
  );
