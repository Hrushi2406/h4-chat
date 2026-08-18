export type WhatsAppInboundType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "interactive"
  | "unsupported";

export interface WhatsAppMediaReference {
  id: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  isVoice?: boolean;
}

export interface WhatsAppInboundMessage {
  id: string;
  from: string;
  phoneNumberId: string;
  receivedAt?: Date;
  profileName?: string;
  timestamp: Date;
  type: WhatsAppInboundType;
  originalType: string;
  text?: string;
  media?: WhatsAppMediaReference;
  replyToMessageId?: string;
}

export interface WhatsAppDeliveryStatus {
  messageId: string;
  recipientId: string;
  status: "sent" | "delivered" | "read" | "failed" | "deleted" | "unknown";
  timestamp: Date;
  errors?: unknown[];
}

export interface ParsedMetaWebhook {
  messages: WhatsAppInboundMessage[];
  statuses: WhatsAppDeliveryStatus[];
}

export type WhatsAppConsentState = "pending" | "accepted" | "declined";

export interface WhatsAppAccountState {
  phoneNumber: string;
  userId?: string;
  profileName?: string;
  consent: WhatsAppConsentState;
  consentVersion?: string;
  optedOut: boolean;
  blocked: boolean;
  cooldownUntil?: Date;
  cooldownNotifiedAt?: Date;
  consentPromptedAt?: Date;
  modelId: string;
  activeThreadId?: string;
  lastInboundAt?: Date;
  lastConversationAt?: Date;
  serviceWindowEndsAt?: Date;
  activeMessageId?: string;
  activeMessageClaimedAt?: Date;
  pendingMessageIds: string[];
  lastUnprocessedMessageId?: string;
  lastFailedOutboundId?: string;
  deliveryRetryOfferedFor?: string;
  requiresWebLink: boolean;
  welcomeCreditsGranted: boolean;
}

export interface WhatsAppButtonPresentation {
  body: string;
  buttons: { id: string; title: string }[];
}

export interface WhatsAppLinkButtonPresentation {
  body: string;
  displayText: string;
  url: string;
}

export interface WhatsAppMediaPresentation {
  url: string;
  kind?: "image" | "document" | "audio";
  caption?: string;
  filename?: string;
}

export interface WhatsAppPresentation {
  buttons?: WhatsAppButtonPresentation;
  linkButton?: WhatsAppLinkButtonPresentation;
  media: WhatsAppMediaPresentation[];
}
