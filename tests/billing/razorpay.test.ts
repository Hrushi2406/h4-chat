import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRechargeOrderDetails,
  resolveInternalPlan,
  updateRazorpaySubscriptionPlan,
  verifyCheckoutSignature,
  verifyRechargeCheckoutSignature,
  verifyWebhookSignature,
  type RazorpayOrder,
  type RazorpaySubscription,
} from "@/lib/billing/razorpay";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Razorpay signatures", () => {
  it("accepts the expected subscription checkout HMAC", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret");
    const paymentId = "pay_test";
    const subscriptionId = "sub_test";
    const signature = createHmac("sha256", "test_secret")
      .update(`${paymentId}|${subscriptionId}`)
      .digest("hex");

    expect(
      verifyCheckoutSignature({ paymentId, subscriptionId, signature }),
    ).toBe(true);
    expect(
      verifyCheckoutSignature({
        paymentId,
        subscriptionId,
        signature: `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`,
      }),
    ).toBe(false);
  });

  it("accepts the expected one-time order checkout HMAC", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret");
    const paymentId = "pay_recharge";
    const orderId = "order_recharge";
    const signature = createHmac("sha256", "test_secret")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    expect(
      verifyRechargeCheckoutSignature({ paymentId, orderId, signature }),
    ).toBe(true);
    expect(
      verifyRechargeCheckoutSignature({
        paymentId,
        orderId: "order_tampered",
        signature,
      }),
    ).toBe(false);
  });

  it("validates webhooks against the untouched raw body", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook_secret");
    const rawBody = '{"event":"subscription.charged","payload":{}}';
    const signature = createHmac("sha256", "webhook_secret")
      .update(rawBody)
      .digest("hex");

    expect(verifyWebhookSignature({ rawBody, signature })).toBe(true);
    expect(
      verifyWebhookSignature({
        rawBody: JSON.stringify(JSON.parse(rawBody), null, 2),
        signature,
      }),
    ).toBe(false);
  });

  it("accepts the previous webhook secret during rotation", () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "new_secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET_PREVIOUS", "previous_secret");
    const rawBody = '{"event":"subscription.charged"}';
    const signature = createHmac("sha256", "previous_secret")
      .update(rawBody)
      .digest("hex");

    expect(verifyWebhookSignature({ rawBody, signature })).toBe(true);
  });
});

describe("Razorpay recharge order resolution", () => {
  const order = {
    id: "order_recharge",
    entity: "order",
    amount: 49_500,
    amount_paid: 49_500,
    amount_due: 0,
    currency: "INR",
    receipt: "recharge_test",
    status: "paid",
    attempts: 1,
    notes: {
      billingKind: "credit_recharge",
      firebaseUid: "user_test",
      credits: "5000",
    },
    created_at: 1_700_000_000,
  } satisfies RazorpayOrder;

  it("accepts only server-priced recharge orders", () => {
    expect(getRechargeOrderDetails(order)).toEqual({
      userId: "user_test",
      credits: 5_000,
      amountPaise: 49_500,
    });
    expect(
      getRechargeOrderDetails({ ...order, amount: 49_499 }),
    ).toBeUndefined();
    expect(
      getRechargeOrderDetails({
        ...order,
        notes: { ...order.notes, credits: "5001" },
      }),
    ).toBeUndefined();
  });
});

describe("Razorpay plan resolution", () => {
  const subscription = {
    id: "sub_test",
    entity: "subscription",
    plan_id: "plan_plus",
    customer_id: "cust_test",
    status: "active",
    current_start: null,
    current_end: null,
    ended_at: null,
    quantity: 1,
    notes: {
      firebaseUid: "user_test",
      internalPlanId: "plus_monthly",
    },
    charge_at: null,
    start_at: 0,
    end_at: 0,
    total_count: 12,
    paid_count: 1,
    remaining_count: 11,
  } satisfies RazorpaySubscription;

  it("maps a configured Razorpay Plan ID", () => {
    vi.stubEnv("RAZORPAY_PLUS_MONTHLY_PLAN_ID", "plan_plus");
    expect(resolveInternalPlan(subscription)).toBe("plus_monthly");
  });

  it("rejects notes that conflict with the configured Plan ID", () => {
    vi.stubEnv("RAZORPAY_PLUS_MONTHLY_PLAN_ID", "plan_other");
    expect(resolveInternalPlan(subscription)).toBeUndefined();
  });
});

describe("Razorpay plan updates", () => {
  it("updates the active subscription immediately", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test_secret");
    vi.stubEnv("RAZORPAY_PRO_MONTHLY_PLAN_ID", "plan_pro");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sub_test",
          entity: "subscription",
          plan_id: "plan_pro",
          status: "active",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateRazorpaySubscriptionPlan({
      subscriptionId: "sub_test",
      planId: "pro_monthly",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.razorpay.com/v1/subscriptions/sub_test",
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      plan_id: "plan_pro",
      schedule_change_at: "now",
      customer_notify: true,
    });
  });
});
