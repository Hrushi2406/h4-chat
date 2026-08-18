export const normalizeWhatsAppFormatting = (message: string) =>
  message
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/```([^\n`]+)```/g, "```$1```");
