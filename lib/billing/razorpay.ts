import "server-only";

import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  BILLING_PLANS,
  PAID_PLAN_IDS,
  getRechargePricePaise,
  isValidRechargeCredits,
  type BillingPlanId,
} from "@/lib/billing/config";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const RAZORPAY_REQUEST_TIMEOUT_MS = 10_000;
const RAZORPAY_READ_MAX_ATTEMPTS = 3;
const RAZORPAY_RETRY_BASE_DELAY_MS = 200;
const RAZORPAY_RETRYABLE_STATUSES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);

export type RazorpaySubscription = {
  id: string;
  entity: "subscription";
  plan_id: string;
  customer_id: string | null;
  status: string;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  quantity: number;
  notes: Record<string, string> | [];
  charge_at: number | null;
  start_at: number;
  end_at: number;
  total_count: number;
  paid_count: number;
  remaining_count: number;
  short_url?: string;
  payment_method?: string;
  has_scheduled_changes?: boolean;
  change_scheduled_at?: number | null;
};

export type RazorpayPayment = {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  amount_refunded: number;
  refund_status: "partial" | "full" | null;
  order_id?: string | null;
  invoice_id?: string | null;
  subscription_id?: string | null;
  notes?: Record<string, string> | [];
};

export type RazorpayOrder = {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  attempts: number;
  notes: Record<string, string> | [];
  created_at: number;
};

export type RazorpayRefund = {
  id: string;
  entity: "refund";
  payment_id: string;
  amount: number;
  status: string;
};

export type RazorpayInvoice = {
  id: string;
  entity: "invoice";
  amount: number;
  amount_paid: number;
  currency: string;
  status: string;
  billing_start?: number;
  billing_end?: number;
  payment_id?: string | null;
  subscription_id?: string | null;
  short_url?: string | null;
  issued_at?: number;
  paid_at?: number | null;
};

export type RazorpayWebhook = {
  event: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment };
    order?: { entity?: RazorpayOrder };
    refund?: {
      entity?: {
        id: string;
        payment_id: string;
        amount: number;
        status: string;
      };
    };
    dispute?: {
      entity?: {
        id: string;
        payment_id?: string;
        amount?: number;
        status?: string;
      };
    };
  };
};

export class RazorpayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpayConfigurationError";
  }
}

export class RazorpayRequestError extends Error {
  readonly status?: number;
  readonly timedOut: boolean;

  constructor(
    message: string,
    { status, timedOut = false }: { status?: number; timedOut?: boolean } = {},
  ) {
    super(message);
    this.name = "RazorpayRequestError";
    this.status = status;
    this.timedOut = timedOut;
  }
}

const getCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new RazorpayConfigurationError(
      "Razorpay test credentials are not configured",
    );
  }
  return { keyId, keySecret };
};

const getRazorpayPlanIdFromEnv = (
  planId: Exclude<BillingPlanId, "free">,
) => {
  const envName = BILLING_PLANS[planId].razorpayPlanEnv;
  return envName ? process.env[envName]?.trim() : undefined;
};

const getPlanIdForRazorpayPlan = (razorpayPlanId: string) =>
  PAID_PLAN_IDS.find(
    (planId) => getRazorpayPlanIdFromEnv(planId) === razorpayPlanId,
  );

const secureCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const razorpayRequest = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const { keyId, keySecret } = getCredentials();
  const method = (init.method ?? "GET").toUpperCase();
  // Retrying reads is safe. Mutations are deliberately attempted once because
  // a timeout can happen after Razorpay has already applied the operation.
  const maxAttempts =
    method === "GET" || method === "HEAD"
      ? RAZORPAY_READ_MAX_ATTEMPTS
      : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (init.signal?.aborted) {
      throw init.signal.reason ?? new Error("Razorpay request was aborted");
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      RAZORPAY_REQUEST_TIMEOUT_MS,
    );
    const abortFromCaller = () => controller.abort();
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const body = (await response.json().catch(() => undefined)) as
        | { error?: { description?: string; reason?: string } }
        | T
        | undefined;
      if (response.ok) return body as T;

      if (
        attempt < maxAttempts &&
        RAZORPAY_RETRYABLE_STATUSES.has(response.status)
      ) {
        await retryDelay(attempt);
        continue;
      }

      const errorBody = body as
        | { error?: { description?: string; reason?: string } }
        | undefined;
      throw new RazorpayRequestError(
        errorBody?.error?.description ||
          errorBody?.error?.reason ||
          `Razorpay request failed with ${response.status}`,
        { status: response.status },
      );
    } catch (error) {
      if (error instanceof RazorpayRequestError) throw error;
      if (init.signal?.aborted) throw error;

      const timedOut = controller.signal.aborted;
      if (attempt < maxAttempts) {
        await retryDelay(attempt);
        continue;
      }
      throw new RazorpayRequestError(
        timedOut
          ? "Razorpay request timed out"
          : "Razorpay request could not be completed",
        { timedOut },
      );
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  throw new RazorpayRequestError("Razorpay request could not be completed");
};

const retryDelay = (attempt: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, RAZORPAY_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  });

export const createRazorpaySubscription = async ({
  userId,
  planId,
}: {
  userId: string;
  planId: Exclude<BillingPlanId, "free">;
}) => {
  const plan = BILLING_PLANS[planId];
  const razorpayPlanId = getRazorpayPlanIdFromEnv(planId);
  if (!razorpayPlanId) {
    throw new RazorpayConfigurationError(
      `Razorpay Plan ID is not configured for ${planId}`,
    );
  }

  return razorpayRequest<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: razorpayPlanId,
      total_count: plan.razorpayTotalCount,
      quantity: 1,
      customer_notify: true,
      notes: {
        firebaseUid: userId,
        internalPlanId: planId,
      },
    }),
  });
};

export const createRazorpayRechargeOrder = async ({
  userId,
  credits,
}: {
  userId: string;
  credits: number;
}) => {
  if (!isValidRechargeCredits(credits)) {
    throw new Error("Invalid recharge credit quantity");
  }
  const amountPaise = getRechargePricePaise(credits);

  return razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `recharge_${Date.now()}_${randomUUID().slice(0, 8)}`,
      notes: {
        billingKind: "credit_recharge",
        firebaseUid: userId,
        credits: String(credits),
      },
    }),
  });
};

export const fetchRazorpaySubscription = (subscriptionId: string) =>
  razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );

export const fetchRazorpayPayment = (paymentId: string) =>
  razorpayRequest<RazorpayPayment>(
    `/payments/${encodeURIComponent(paymentId)}`,
  );

export const fetchRazorpayOrder = (orderId: string) =>
  razorpayRequest<RazorpayOrder>(
    `/orders/${encodeURIComponent(orderId)}`,
  );

export const fetchRazorpayPaymentRefunds = async (paymentId: string) => {
  const params = new URLSearchParams({ count: "100" });
  const result = await razorpayRequest<{ items?: RazorpayRefund[] }>(
    `/payments/${encodeURIComponent(paymentId)}/refunds?${params.toString()}`,
  );
  return result.items ?? [];
};

export const fetchRazorpayInvoice = (invoiceId: string) =>
  razorpayRequest<RazorpayInvoice>(
    `/invoices/${encodeURIComponent(invoiceId)}`,
  );

export const cancelRazorpaySubscription = (
  subscriptionId: string,
  cancelAtCycleEnd = true,
) =>
  razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd }),
    },
  );

export const updateRazorpaySubscriptionPlan = ({
  subscriptionId,
  planId,
  scheduleChangeAt = "now",
}: {
  subscriptionId: string;
  planId: Exclude<BillingPlanId, "free">;
  scheduleChangeAt?: "now" | "cycle_end";
}) => {
  const razorpayPlanId = getRazorpayPlanIdFromEnv(planId);
  if (!razorpayPlanId) {
    throw new RazorpayConfigurationError(
      `Razorpay Plan ID is not configured for ${planId}`,
    );
  }

  return razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        plan_id: razorpayPlanId,
        schedule_change_at: scheduleChangeAt,
        customer_notify: true,
      }),
    },
  );
};

export const verifyCheckoutSignature = ({
  paymentId,
  subscriptionId,
  signature,
}: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}) => {
  const { keySecret } = getCredentials();
  const expected = createHmac("sha256", keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  return secureCompare(expected, signature);
};

export const verifyRechargeCheckoutSignature = ({
  paymentId,
  orderId,
  signature,
}: {
  paymentId: string;
  orderId: string;
  signature: string;
}) => {
  const { keySecret } = getCredentials();
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return secureCompare(expected, signature);
};

export const verifyWebhookSignature = ({
  rawBody,
  signature,
}: {
  rawBody: string;
  signature: string;
}) => {
  const secrets = [
    process.env.RAZORPAY_WEBHOOK_SECRET?.trim(),
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS?.trim(),
  ].filter((secret): secret is string => Boolean(secret));
  if (secrets.length === 0) {
    throw new RazorpayConfigurationError(
      "Razorpay webhook secret is not configured",
    );
  }
  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return secureCompare(expected, signature);
  });
};

export const getSubscriptionOwner = (subscription: RazorpaySubscription) => {
  if (Array.isArray(subscription.notes)) return undefined;
  const value = subscription.notes.firebaseUid;
  return typeof value === "string" && value ? value : undefined;
};

export const getRechargeOrderDetails = (order: RazorpayOrder) => {
  if (Array.isArray(order.notes)) return undefined;
  if (order.notes.billingKind !== "credit_recharge") return undefined;

  const userId = order.notes.firebaseUid;
  const credits = Number(order.notes.credits);
  if (
    typeof userId !== "string" ||
    !userId ||
    !isValidRechargeCredits(credits) ||
    order.currency !== "INR" ||
    order.amount !== getRechargePricePaise(credits)
  ) {
    return undefined;
  }
  return {
    userId,
    credits,
    amountPaise: order.amount,
  };
};

export const resolveInternalPlan = (subscription: RazorpaySubscription) => {
  const fromRazorpayId = getPlanIdForRazorpayPlan(subscription.plan_id);
  if (fromRazorpayId) return fromRazorpayId;

  if (!Array.isArray(subscription.notes)) {
    const fromNotes = subscription.notes.internalPlanId;
    if (
      fromNotes &&
      fromNotes !== "free" &&
      fromNotes in BILLING_PLANS
    ) {
      const planId = fromNotes as Exclude<BillingPlanId, "free">;
      const configuredRazorpayPlanId = getRazorpayPlanIdFromEnv(planId);
      if (
        !configuredRazorpayPlanId ||
        configuredRazorpayPlanId === subscription.plan_id
      ) {
        return planId;
      }
    }
  }

  return undefined;
};

export const getRazorpayPublicKeyId = () => getCredentials().keyId;

export const unixDate = (value: number | null | undefined) =>
  value && value > 0 ? new Date(value * 1_000) : null;
