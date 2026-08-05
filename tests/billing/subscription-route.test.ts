import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activatePaidPlan: vi.fn(),
  attachCheckoutSubscription: vi.fn(),
  cancelRazorpaySubscription: vi.fn(),
  clearFailedCheckout: vi.fn(),
  clearPendingReplacementCheckout: vi.fn(),
  clearTerminalCheckout: vi.fn(),
  createRazorpaySubscription: vi.fn(),
  fetchRazorpayPayment: vi.fn(),
  fetchRazorpaySubscription: vi.fn(),
  getCurrentBilling: vi.fn(),
  getRazorpayPublicKeyId: vi.fn(),
  getSubscriptionOwner: vi.fn(),
  markCancelAtPeriodEnd: vi.fn(),
  resolveInternalPlan: vi.fn(),
  setCheckoutPending: vi.fn(),
  setPendingReplacementCheckout: vi.fn(),
  toBillingSummary: vi.fn(),
  unixDate: vi.fn(),
  updateRazorpaySubscriptionPlan: vi.fn(),
  verifyCheckoutSignature: vi.fn(),
  verifyFirebaseIdToken: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  activatePaidPlan: mocks.activatePaidPlan,
  attachCheckoutSubscription: mocks.attachCheckoutSubscription,
  clearFailedCheckout: mocks.clearFailedCheckout,
  clearPendingReplacementCheckout: mocks.clearPendingReplacementCheckout,
  clearTerminalCheckout: mocks.clearTerminalCheckout,
  getCurrentBilling: mocks.getCurrentBilling,
  markCancelAtPeriodEnd: mocks.markCancelAtPeriodEnd,
  setCheckoutPending: mocks.setCheckoutPending,
  setPendingReplacementCheckout: mocks.setPendingReplacementCheckout,
  toBillingSummary: mocks.toBillingSummary,
}));

vi.mock("@/lib/billing/razorpay", () => ({
  cancelRazorpaySubscription: mocks.cancelRazorpaySubscription,
  createRazorpaySubscription: mocks.createRazorpaySubscription,
  fetchRazorpayPayment: mocks.fetchRazorpayPayment,
  fetchRazorpaySubscription: mocks.fetchRazorpaySubscription,
  getRazorpayPublicKeyId: mocks.getRazorpayPublicKeyId,
  getSubscriptionOwner: mocks.getSubscriptionOwner,
  resolveInternalPlan: mocks.resolveInternalPlan,
  unixDate: mocks.unixDate,
  updateRazorpaySubscriptionPlan: mocks.updateRazorpaySubscriptionPlan,
  verifyCheckoutSignature: mocks.verifyCheckoutSignature,
}));

vi.mock("@/lib/firebase-auth-server", () => ({
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
}));

import { POST } from "@/app/api/billing/subscription/route";

const currentBilling = {
  planId: "plus_monthly",
  subscriptionStatus: "active",
  razorpaySubscriptionId: "sub_plus",
  pendingPlanId: null,
  pendingRazorpaySubscriptionId: null,
};

const updatedSubscription = {
  id: "sub_plus",
  entity: "subscription",
  plan_id: "plan_pro",
  customer_id: "cust_test",
  status: "active",
  current_end: 1_800_000_000,
  charge_at: 1_799_000_000,
};

const requestFor = (body: unknown) =>
  new Request("http://localhost/api/billing/subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyFirebaseIdToken.mockResolvedValue("user_test");
  mocks.getCurrentBilling.mockResolvedValue(currentBilling);
  mocks.getRazorpayPublicKeyId.mockReturnValue("rzp_test_key");
  mocks.updateRazorpaySubscriptionPlan.mockResolvedValue(updatedSubscription);
  mocks.resolveInternalPlan.mockReturnValue("pro_monthly");
  mocks.unixDate.mockImplementation((value: number | null | undefined) =>
    value ? new Date(value * 1_000) : null,
  );
  mocks.activatePaidPlan.mockResolvedValue({
    planId: "pro_monthly",
    subscriptionStatus: "active",
  });
  mocks.toBillingSummary.mockReturnValue({
    planId: "pro_monthly",
    subscriptionStatus: "active",
  });
});

describe("subscription plan changes", () => {
  it("updates an active card subscription in place and reconciles billing", async () => {
    const response = await POST(
      requestFor({
        action: "change_plan",
        authToken: "token",
        planId: "pro_monthly",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateRazorpaySubscriptionPlan).toHaveBeenCalledWith({
      subscriptionId: "sub_plus",
      planId: "pro_monthly",
      scheduleChangeAt: "now",
    });
    expect(mocks.activatePaidPlan).toHaveBeenCalledWith({
      userId: "user_test",
      planId: "pro_monthly",
      subscriptionId: "sub_plus",
      customerId: "cust_test",
      razorpayStatus: "active",
      paidThrough: new Date(1_800_000_000_000),
      nextPaymentAt: new Date(1_799_000_000_000),
    });
    expect(mocks.cancelRazorpaySubscription).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      updated: true,
      billing: {
        planId: "pro_monthly",
        subscriptionStatus: "active",
      },
    });
  });

  it("opens a replacement checkout without cancelling the current plan when an in-place update is unsupported", async () => {
    mocks.updateRazorpaySubscriptionPlan.mockRejectedValue(
      new Error("subscriptions cannot be updated when payment mode is upi"),
    );
    mocks.createRazorpaySubscription.mockResolvedValue({
      id: "sub_pro_replacement",
      status: "created",
    });

    const response = await POST(
      requestFor({
        action: "change_plan",
        authToken: "token",
        planId: "pro_monthly",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createRazorpaySubscription).toHaveBeenCalledWith({
      userId: "user_test",
      planId: "pro_monthly",
    });
    expect(mocks.setPendingReplacementCheckout).toHaveBeenCalledWith({
      userId: "user_test",
      planId: "pro_monthly",
      subscriptionId: "sub_pro_replacement",
    });
    expect(mocks.cancelRazorpaySubscription).not.toHaveBeenCalled();
    expect(mocks.activatePaidPlan).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      checkout: {
        keyId: "rzp_test_key",
        subscriptionId: "sub_pro_replacement",
        name: "Sakhi AI",
        description: "Pro monthly subscription",
        currency: "INR",
        amountPaise: 199900,
      },
    });
  });

  it("cancels the old plan only after a replacement payment is captured", async () => {
    mocks.verifyCheckoutSignature.mockReturnValue(true);
    mocks.getCurrentBilling.mockResolvedValue({
      ...currentBilling,
      pendingPlanId: "pro_monthly",
      pendingRazorpaySubscriptionId: "sub_pro_replacement",
    });
    mocks.fetchRazorpaySubscription.mockResolvedValue({
      ...updatedSubscription,
      id: "sub_pro_replacement",
      notes: { userId: "user_test", planId: "pro_monthly" },
    });
    mocks.fetchRazorpayPayment.mockResolvedValue({
      id: "pay_pro",
      subscription_id: "sub_pro_replacement",
      captured: true,
      status: "captured",
      currency: "INR",
      amount: 199900,
    });
    mocks.getSubscriptionOwner.mockReturnValue("user_test");

    const response = await POST(
      requestFor({
        action: "verify",
        authToken: "token",
        razorpayPaymentId: "pay_pro",
        razorpaySubscriptionId: "sub_pro_replacement",
        razorpaySignature: "signature",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancelRazorpaySubscription).toHaveBeenCalledWith(
      "sub_plus",
      false,
    );
    expect(mocks.activatePaidPlan).toHaveBeenCalledWith({
      userId: "user_test",
      planId: "pro_monthly",
      subscriptionId: "sub_pro_replacement",
      customerId: "cust_test",
      razorpayStatus: "active",
      paidThrough: new Date(1_800_000_000_000),
      nextPaymentAt: new Date(1_799_000_000_000),
    });
  });

  it("does not replace the current plan when a late payment belongs to a cancelled replacement", async () => {
    mocks.verifyCheckoutSignature.mockReturnValue(true);
    mocks.getCurrentBilling.mockResolvedValue({
      ...currentBilling,
      pendingPlanId: "pro_monthly",
      pendingRazorpaySubscriptionId: "sub_pro_replacement",
    });
    mocks.fetchRazorpaySubscription.mockResolvedValue({
      ...updatedSubscription,
      id: "sub_pro_replacement",
      status: "cancelled",
      notes: { userId: "user_test", planId: "pro_monthly" },
    });
    mocks.fetchRazorpayPayment.mockResolvedValue({
      id: "pay_pro",
      subscription_id: "sub_pro_replacement",
      captured: true,
      status: "captured",
      currency: "INR",
      amount: 199900,
    });
    mocks.getSubscriptionOwner.mockReturnValue("user_test");

    const response = await POST(
      requestFor({
        action: "verify",
        authToken: "token",
        razorpayPaymentId: "pay_pro",
        razorpaySubscriptionId: "sub_pro_replacement",
        razorpaySignature: "signature",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.cancelRazorpaySubscription).not.toHaveBeenCalled();
    expect(mocks.activatePaidPlan).not.toHaveBeenCalled();
  });
});
