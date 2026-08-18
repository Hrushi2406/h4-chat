// WhatsApp renders none of Markdown's link syntax, so a [label](url) reaches the
// user as literal brackets. The system prompt already forbids them, but models
// still emit them, so strip them here where the outcome is guaranteed.
const MARKDOWN_LINK = /\[([^\]\n]*)\]\(\s*((?:https?:\/\/|mailto:)[^\s)]+)\s*\)/g;

// Compare a label to its target ignoring protocol and trailing slash, so
// [example.com/x](https://example.com/x) collapses as a duplicate too.
const bareUrl = (value: string) => value.replace(/^https?:\/\//, "").replace(/\/+$/, "");

const unwrapMarkdownLink = (_match: string, label: string, url: string) => {
  const target = url.trim();
  const text = label.trim();
  return !text || bareUrl(text) === bareUrl(target) ? target : `${text}: ${target}`;
};

export const normalizeWhatsAppFormatting = (message: string) =>
  message
    .replace(MARKDOWN_LINK, unwrapMarkdownLink)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/```([^\n`]+)```/g, "```$1```");
