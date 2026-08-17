import type {
  ParsedMetaWebhook,
  WhatsAppDeliveryStatus,
  WhatsAppInboundMessage,
  WhatsAppInboundType,
} from "@/lib/whatsapp/types";

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const eventDate = (value: unknown): Date => {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1_000) : new Date(0);
};

const supportedType = (type: string): WhatsAppInboundType => {
  switch (type) {
    case "text":
    case "image":
    case "document":
    case "audio":
    case "interactive":
      return type;
    default:
      return "unsupported";
  }
};

const parseInbound = (
  value: Record<string, unknown>,
  raw: unknown,
): WhatsAppInboundMessage | undefined => {
  const message = record(raw);
  const id = string(message?.id);
  const from = string(message?.from);
  const originalType = string(message?.type);
  const phoneNumberId = string(record(value.metadata)?.phone_number_id);
  if (!message || !id || !from || !originalType || !phoneNumberId) return;

  const contacts = array(value.contacts).map(record).filter(Boolean);
  const contact = contacts.find((candidate) => string(candidate?.wa_id) === from);
  const typed = record(message[originalType]);
  const interactive = record(message.interactive);
  const interactiveReply =
    record(interactive?.button_reply) ?? record(interactive?.list_reply);
  const type = supportedType(originalType);
  const isMedia = type === "image" || type === "document" || type === "audio";

  return {
    id,
    from,
    phoneNumberId,
    profileName: string(record(contact?.profile)?.name),
    timestamp: eventDate(message.timestamp),
    type,
    originalType,
    text:
      type === "text"
        ? string(record(message.text)?.body)
        : type === "interactive"
          ? string(interactiveReply?.id) ?? string(interactiveReply?.title)
          : string(typed?.caption),
    media: isMedia
      ? {
          id: string(typed?.id) ?? "",
          mimeType: string(typed?.mime_type),
          filename: string(typed?.filename),
          caption: string(typed?.caption),
          isVoice: typed?.voice === true,
        }
      : undefined,
    replyToMessageId: string(record(message.context)?.id),
  };
};

const parseStatus = (raw: unknown): WhatsAppDeliveryStatus | undefined => {
  const status = record(raw);
  const messageId = string(status?.id);
  const recipientId = string(status?.recipient_id);
  if (!messageId || !recipientId) return;
  const rawStatus = string(status?.status) ?? "unknown";
  const normalized = ["sent", "delivered", "read", "failed", "deleted"].includes(rawStatus)
    ? (rawStatus as WhatsAppDeliveryStatus["status"])
    : "unknown";

  return {
    messageId,
    recipientId,
    status: normalized,
    timestamp: eventDate(status?.timestamp),
    errors: array(status?.errors),
  };
};

export const parseMetaWebhook = (payload: unknown): ParsedMetaWebhook => {
  const messages: WhatsAppInboundMessage[] = [];
  const statuses: WhatsAppDeliveryStatus[] = [];
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account") return { messages, statuses };

  for (const rawEntry of array(root.entry)) {
    const entry = record(rawEntry);
    for (const rawChange of array(entry?.changes)) {
      const change = record(rawChange);
      if (change?.field !== "messages") continue;
      const value = record(change.value);
      if (!value) continue;

      for (const rawMessage of array(value.messages)) {
        const parsed = parseInbound(value, rawMessage);
        if (parsed) messages.push(parsed);
      }
      for (const rawStatus of array(value.statuses)) {
        const parsed = parseStatus(rawStatus);
        if (parsed) statuses.push(parsed);
      }
    }
  }

  return { messages, statuses };
};
