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
  | "retry";

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
]);

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
