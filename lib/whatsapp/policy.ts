const FOUR_HOURS_MS = 4 * 60 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

export type WhatsAppCommand =
  | "new"
  | "cancel"
  | "credits"
  | "model"
  | "support"
  | "stop"
  | "start"
  | "continue"
  | "exit"
  | "retry"
  | "billing_add_credits"
  | "billing_compare_plans"
  | "retry_delivery";

const COMMANDS = new Set<WhatsAppCommand>([
  "new",
  "cancel",
  "credits",
  "model",
  "support",
  "stop",
  "start",
  "continue",
  "exit",
  "retry",
  "billing_add_credits",
  "billing_compare_plans",
  "retry_delivery",
]);

const DELIVERY_STATUS_RANK = {
  unknown: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
  deleted: 5,
} as const;

const TRANSIENT_META_ERROR_CODES = new Set([5, 130429, 131000, 131016, 131048]);

export const shouldApplyDeliveryStatus = (
  current: { status?: string; timestamp?: Date },
  incoming: { status: keyof typeof DELIVERY_STATUS_RANK; timestamp: Date },
) => {
  if (!current.status || !current.timestamp) return true;
  if (incoming.timestamp.getTime() < current.timestamp.getTime()) return false;
  const currentRank = DELIVERY_STATUS_RANK[current.status as keyof typeof DELIVERY_STATUS_RANK] ?? 0;
  return DELIVERY_STATUS_RANK[incoming.status] >= currentRank;
};

export const isRetryableMetaFailure = (errors: unknown[] | undefined) =>
  Boolean(errors?.some((error) => {
    if (!error || typeof error !== "object") return false;
    const code = Number((error as { code?: unknown }).code);
    return TRANSIENT_META_ERROR_CODES.has(code);
  }));

export const normalizeWhatsAppCommand = (
  input: string | undefined,
): WhatsAppCommand | undefined => {
  if (!input) return;
  const normalized = input.trim().toLowerCase().replace(/^\//, "");
  return COMMANDS.has(normalized as WhatsAppCommand)
    ? (normalized as WhatsAppCommand)
    : undefined;
};

export const shouldStartNewThread = (
  lastInboundAt: Date | undefined,
  now = new Date(),
): boolean => !lastInboundAt || now.getTime() - lastInboundAt.getTime() > FOUR_HOURS_MS;

export const isInsideCustomerServiceWindow = (
  lastInboundAt: Date | undefined,
  now = new Date(),
): boolean =>
  Boolean(
    lastInboundAt &&
      now.getTime() >= lastInboundAt.getTime() &&
      now.getTime() - lastInboundAt.getTime() <= TWENTY_FOUR_HOURS_MS,
  );

export const shouldNotifyAutomationOnWhatsApp = (
  optedIn: boolean,
  lastInboundAt: Date | undefined,
  now = new Date(),
): boolean => optedIn && isInsideCustomerServiceWindow(lastInboundAt, now);
