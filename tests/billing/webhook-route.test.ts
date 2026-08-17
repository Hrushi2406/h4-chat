import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activatePaidPlan: vi.fn(),
  reconcileRechargePurchase: vi.fn(),
  resolveCanonicalBillingUserId: vi.fn(),
  revokePaidCredits: vi.fn(),
  updateSubscriptionState: vi.fn(),
  cancelRazorpaySubscription: vi.fn(),
  fetchRazorpayInvoice: vi.fn(),
  fetchRazorpayOrder: vi.fn(),
  fetchRazorpayPayment: vi.fn(),
  fetchRazorpayPaymentRefunds: vi.fn(),
  fetchRazorpaySubscription: vi.fn(),
  getCurrentBilling: vi.fn(),
  getRechargeOrderDetails: vi.fn(),
  getSubscriptionOwner: vi.fn(),
  resolveInternalPlan: vi.fn(),
  unixDate: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  activatePaidPlan: mocks.activatePaidPlan,
  reconcileRechargePurchase: mocks.reconcileRechargePurchase,
  revokePaidCredits: mocks.revokePaidCredits,
  updateSubscriptionState: mocks.updateSubscriptionState,
  getCurrentBilling: mocks.getCurrentBilling,
  resolveCanonicalBillingUserId: mocks.resolveCanonicalBillingUserId,
}));

vi.mock("@/lib/billing/razorpay", () => ({
  cancelRazorpaySubscription: mocks.cancelRazorpaySubscription,
  fetchRazorpayInvoice: mocks.fetchRazorpayInvoice,
  fetchRazorpayOrder: mocks.fetchRazorpayOrder,
  fetchRazorpayPayment: mocks.fetchRazorpayPayment,
  fetchRazorpayPaymentRefunds: mocks.fetchRazorpayPaymentRefunds,
  fetchRazorpaySubscription: mocks.fetchRazorpaySubscription,
  getRechargeOrderDetails: mocks.getRechargeOrderDetails,
  getSubscriptionOwner: mocks.getSubscriptionOwner,
  resolveInternalPlan: mocks.resolveInternalPlan,
  unixDate: mocks.unixDate,
  verifyWebhookSignature: mocks.verifyWebhookSignature,
}));

import { POST } from "@/app/api/billing/webhook/razorpay/route";

const subscription = {
  id: "sub_test",
  status: "active",
  customer_id: "cust_test",
  current_end: 1_800_000_000,
  charge_at: 1_799_000_000,
};

const payment = {
  id: "pay_test",
  amount: 39_900,
  amount_refunded: 0,
  captured: true,
  status: "captured",
  subscription_id: subscription.id,
};

const rechargeOrder = {
  id: "order_recharge",
  amount: 49_500,
  amount_paid: 49_500,
  currency: "INR",
  status: "paid",
  created_at: 1_700_000_000,
};

const rechargePayment = {
  ...payment,
  id: "pay_recharge",
  amount: 49_500,
  currency: "INR",
  order_id: rechargeOrder.id,
  subscription_id: null,
};

const requestFor = (body: unknown, signature = "valid") =>
  new Request("http://localhost/api/billing/webhook/razorpay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyWebhookSignature.mockReturnValue(true);
  mocks.fetchRazorpaySubscription.mockResolvedValue(subscription);
  mocks.fetchRazorpayInvoice.mockResolvedValue({
    id: "inv_test",
    subscription_id: subscription.id,
  });
  mocks.fetchRazorpayPaymentRefunds.mockResolvedValue([]);
  mocks.fetchRazorpayOrder.mockResolvedValue(rechargeOrder);
  mocks.getCurrentBilling.mockResolvedValue({
    razorpaySubscriptionId: subscription.id,
  });
  mocks.cancelRazorpaySubscription.mockResolvedValue(subscription);
  mocks.getSubscriptionOwner.mockReturnValue("user_test");
  mocks.resolveCanonicalBillingUserId.mockImplementation(async (userId: string) => userId);
  mocks.resolveInternalPlan.mockReturnValue("plus_monthly");
  mocks.getRechargeOrderDetails.mockReturnValue(undefined);
  mocks.unixDate.mockImplementation((value: number | null | undefined) =>
    value ? new Date(value * 1_000) : null,
  );
});

describe("Razorpay webhook route", () => {
  it("rejects an invalid signature before touching Razorpay", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(false);

    const response = await POST(
      requestFor({ event: "subscription.charged" }, "invalid"),
    );

    expect(response.status).toBe(401);
    expect(mocks.fetchRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("ignores a valid event that has no related subscription", async () => {
    const response = await POST(requestFor({ event: "payment.captured" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      ignored: true,
    });
  });

  it("activates a plan for a captured subscription charge", async () => {
    const response = await POST(
      requestFor({
        event: "subscription.charged",
        payload: {
          subscription: { entity: subscription },
          payment: { entity: payment },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.activatePaidPlan).toHaveBeenCalledOnce();
    expect(mocks.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it("grants a captured one-time recharge without touching subscriptions", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue(rechargePayment);
    mocks.getRechargeOrderDetails.mockReturnValue({
      userId: "user_test",
      credits: 5_000,
      amountPaise: 49_500,
    });

    const response = await POST(
      requestFor({
        event: "payment.captured",
        payload: { payment: { entity: rechargePayment } },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reconcileRechargePurchase).toHaveBeenCalledWith({
      userId: "user_test",
      orderId: rechargeOrder.id,
      paymentId: rechargePayment.id,
      creditsPurchased: 5_000,
      amountPaise: 49_500,
      purchasedAt: new Date(1_700_000_000_000),
      refundedPaise: 0,
      dispute: false,
      eventId: undefined,
    });
    expect(mocks.fetchRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("reconciles a partial recharge refund proportionally", async () => {
    const refundedPayment = {
      ...rechargePayment,
      amount_refunded: 24_750,
      refund_status: "partial",
    };
    mocks.fetchRazorpayPayment.mockResolvedValue(refundedPayment);
    mocks.fetchRazorpayPaymentRefunds.mockResolvedValue([
      {
        id: "rfnd_recharge_half",
        payment_id: rechargePayment.id,
        amount: 24_750,
        status: "processed",
      },
    ]);
    mocks.getRechargeOrderDetails.mockReturnValue({
      userId: "user_test",
      credits: 5_000,
      amountPaise: 49_500,
    });

    const response = await POST(
      requestFor({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_recharge_half",
              payment_id: rechargePayment.id,
              amount: 24_750,
              status: "processed",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reconcileRechargePurchase).toHaveBeenCalledWith({
      userId: "user_test",
      orderId: rechargeOrder.id,
      paymentId: rechargePayment.id,
      creditsPurchased: 5_000,
      amountPaise: 49_500,
      purchasedAt: new Date(1_700_000_000_000),
      refundedPaise: 24_750,
      dispute: false,
      eventId: "rfnd_recharge_half",
    });
    expect(mocks.revokePaidCredits).not.toHaveBeenCalled();
  });

  it("revokes the full recharge entitlement after a dispute", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue(rechargePayment);
    mocks.getRechargeOrderDetails.mockReturnValue({
      userId: "user_test",
      credits: 5_000,
      amountPaise: 49_500,
    });

    const response = await POST(
      requestFor({
        event: "payment.dispute.created",
        payload: {
          dispute: {
            entity: {
              id: "disp_recharge",
              payment_id: rechargePayment.id,
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reconcileRechargePurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: rechargePayment.id,
        dispute: true,
      }),
    );
    expect(mocks.cancelRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("updates state without granting credits for non-charge events", async () => {
    const response = await POST(
      requestFor({
        event: "subscription.pending",
        payload: { subscription: { entity: subscription } },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSubscriptionState).toHaveBeenCalledOnce();
    expect(mocks.activatePaidPlan).not.toHaveBeenCalled();
  });

  it("applies the authoritative plan on subscription.updated", async () => {
    mocks.resolveInternalPlan.mockReturnValue("pro_monthly");

    const response = await POST(
      requestFor({
        event: "subscription.updated",
        payload: { subscription: { entity: subscription } },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.activatePaidPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_test",
        planId: "pro_monthly",
        subscriptionId: subscription.id,
      }),
    );
    expect(mocks.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it("activates a paid replacement and then stops the previous subscription", async () => {
    const replacement = {
      ...subscription,
      id: "sub_pro_replacement",
    };
    mocks.fetchRazorpaySubscription.mockResolvedValue(replacement);
    mocks.getCurrentBilling.mockResolvedValue({
      razorpaySubscriptionId: "sub_plus",
      pendingPlanId: "pro_monthly",
      pendingRazorpaySubscriptionId: replacement.id,
    });
    mocks.resolveInternalPlan.mockReturnValue("pro_monthly");

    const response = await POST(
      requestFor({
        event: "subscription.charged",
        payload: {
          subscription: { entity: replacement },
          payment: {
            entity: {
              ...payment,
              subscription_id: replacement.id,
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancelRazorpaySubscription).toHaveBeenCalledWith(
      "sub_plus",
      false,
    );
    expect(mocks.activatePaidPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_test",
        planId: "pro_monthly",
        subscriptionId: replacement.id,
      }),
    );
    expect(mocks.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it("does not activate a cancelled replacement after a late charge event", async () => {
    const replacement = {
      ...subscription,
      id: "sub_cancelled_replacement",
      status: "cancelled",
    };
    mocks.fetchRazorpaySubscription.mockResolvedValue(replacement);
    mocks.getCurrentBilling.mockResolvedValue({
      razorpaySubscriptionId: "sub_plus",
      pendingPlanId: "pro_monthly",
      pendingRazorpaySubscriptionId: replacement.id,
    });
    mocks.resolveInternalPlan.mockReturnValue("pro_monthly");

    const response = await POST(
      requestFor({
        event: "subscription.charged",
        payload: {
          subscription: { entity: replacement },
          payment: {
            entity: {
              ...payment,
              subscription_id: replacement.id,
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancelRazorpaySubscription).not.toHaveBeenCalled();
    expect(mocks.activatePaidPlan).not.toHaveBeenCalled();
    expect(mocks.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it("keeps access after a partial refund", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue({
      ...payment,
      amount_refunded: 10_000,
      refund_status: "partial",
    });
    mocks.fetchRazorpayPaymentRefunds.mockResolvedValue([
      {
        id: "rfnd_partial",
        payment_id: payment.id,
        amount: 10_000,
        status: "processed",
      },
    ]);

    const response = await POST(
      requestFor({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_partial",
              payment_id: payment.id,
              amount: 10_000,
              status: "processed",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancelRazorpaySubscription).not.toHaveBeenCalled();
    expect(mocks.revokePaidCredits).not.toHaveBeenCalled();
    expect(mocks.updateSubscriptionState).toHaveBeenCalledOnce();
  });

  it("stops rebilling and revokes paid credits after a full refund", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue({
      ...payment,
      amount_refunded: payment.amount,
      refund_status: "full",
    });
    mocks.fetchRazorpayPaymentRefunds.mockResolvedValue([
      {
        id: "rfnd_full",
        payment_id: payment.id,
        amount: payment.amount,
        status: "processed",
      },
    ]);

    const response = await POST(
      requestFor({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_full",
              payment_id: payment.id,
              amount: payment.amount,
              status: "processed",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancelRazorpaySubscription).toHaveBeenCalledWith(
      subscription.id,
      false,
    );
    expect(mocks.revokePaidCredits).toHaveBeenCalledWith({
      userId: "user_test",
      subscriptionId: subscription.id,
      reason: "full_refund",
    });
  });

  it("uses the refund list when the payment total is briefly stale", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue({
      ...payment,
      amount_refunded: 10_000,
      refund_status: "partial",
    });
    mocks.fetchRazorpayPaymentRefunds.mockResolvedValue([
      {
        id: "rfnd_first",
        payment_id: payment.id,
        amount: 10_000,
        status: "processed",
      },
      {
        id: "rfnd_remaining",
        payment_id: payment.id,
        amount: payment.amount - 10_000,
        status: "processed",
      },
    ]);

    const response = await POST(
      requestFor({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_remaining",
              payment_id: payment.id,
              amount: payment.amount - 10_000,
              status: "processed",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.revokePaidCredits).toHaveBeenCalledOnce();
  });

  it("resolves a refunded subscription payment through its invoice", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue({
      ...payment,
      subscription_id: null,
      invoice_id: "inv_test",
      amount_refunded: payment.amount,
      refund_status: "full",
    });
    mocks.fetchRazorpayPaymentRefunds.mockResolvedValue([
      {
        id: "rfnd_invoice_lookup",
        payment_id: payment.id,
        amount: payment.amount,
        status: "processed",
      },
    ]);

    const response = await POST(
      requestFor({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_invoice_lookup",
              payment_id: payment.id,
              amount: payment.amount,
              status: "processed",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.fetchRazorpayInvoice).toHaveBeenCalledWith("inv_test");
    expect(mocks.revokePaidCredits).toHaveBeenCalledOnce();
  });

  it("asks Razorpay to retry while the processed refund is not readable", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue({
      ...payment,
      amount_refunded: 0,
      refund_status: null,
    });

    const response = await POST(
      requestFor({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_not_visible_yet",
              payment_id: payment.id,
              amount: 10_000,
              status: "processed",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.updateSubscriptionState).not.toHaveBeenCalled();
    expect(mocks.revokePaidCredits).not.toHaveBeenCalled();
  });

  it("ignores events from a subscription that has been replaced", async () => {
    mocks.getCurrentBilling.mockResolvedValue({
      razorpaySubscriptionId: "sub_new",
    });

    const response = await POST(
      requestFor({
        event: "subscription.charged",
        payload: {
          subscription: { entity: subscription },
          payment: { entity: payment },
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ignored: true,
      reason: "stale_subscription",
    });
    expect(mocks.activatePaidPlan).not.toHaveBeenCalled();
    expect(mocks.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it("stops rebilling and freezes access after a dispute", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue(payment);

    const response = await POST(
      requestFor({
        event: "payment.dispute.created",
        payload: {
          dispute: {
            entity: {
              id: "disp_test",
              payment_id: payment.id,
              amount: payment.amount,
              status: "open",
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancelRazorpaySubscription).toHaveBeenCalledWith(
      subscription.id,
      false,
    );
    expect(mocks.revokePaidCredits).toHaveBeenCalledWith({
      userId: "user_test",
      subscriptionId: subscription.id,
      reason: "dispute",
    });
  });
});
