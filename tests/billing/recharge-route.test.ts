import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRazorpayRechargeOrder: vi.fn(),
  ensureBillingProfile: vi.fn(),
  fetchRazorpayOrder: vi.fn(),
  fetchRazorpayPayment: vi.fn(),
  getRazorpayPublicKeyId: vi.fn(),
  getRechargeOrderDetails: vi.fn(),
  reconcileRechargePurchase: vi.fn(),
  toBillingSummary: vi.fn(),
  verifyFirebaseIdToken: vi.fn(),
  verifyRechargeCheckoutSignature: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  ensureBillingProfile: mocks.ensureBillingProfile,
  reconcileRechargePurchase: mocks.reconcileRechargePurchase,
  toBillingSummary: mocks.toBillingSummary,
}));

vi.mock("@/lib/billing/razorpay", () => ({
  createRazorpayRechargeOrder: mocks.createRazorpayRechargeOrder,
  fetchRazorpayOrder: mocks.fetchRazorpayOrder,
  fetchRazorpayPayment: mocks.fetchRazorpayPayment,
  getRazorpayPublicKeyId: mocks.getRazorpayPublicKeyId,
  getRechargeOrderDetails: mocks.getRechargeOrderDetails,
  verifyRechargeCheckoutSignature: mocks.verifyRechargeCheckoutSignature,
}));

vi.mock("@/lib/firebase-auth-server", () => ({
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
}));

import { POST } from "@/app/api/billing/recharge/route";

const order = {
  id: "order_recharge",
  amount: 49_500,
  amount_paid: 49_500,
  currency: "INR",
  status: "paid",
  created_at: 1_700_000_000,
};

const payment = {
  id: "pay_recharge",
  order_id: order.id,
  amount: order.amount,
  amount_refunded: 0,
  currency: "INR",
  captured: true,
  status: "captured",
};

const requestFor = (body: unknown) =>
  new Request("http://localhost/api/billing/recharge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyFirebaseIdToken.mockResolvedValue("user_test");
  mocks.verifyRechargeCheckoutSignature.mockReturnValue(true);
  mocks.createRazorpayRechargeOrder.mockResolvedValue(order);
  mocks.fetchRazorpayOrder.mockResolvedValue(order);
  mocks.fetchRazorpayPayment.mockResolvedValue(payment);
  mocks.getRazorpayPublicKeyId.mockReturnValue("rzp_test_key");
  mocks.getRechargeOrderDetails.mockReturnValue({
    userId: "user_test",
    credits: 5_000,
    amountPaise: 49_500,
  });
  mocks.reconcileRechargePurchase.mockResolvedValue({
    billing: { credits: { rechargeAvailable: 5_000 } },
    duplicate: false,
  });
  mocks.toBillingSummary.mockReturnValue({
    rechargeCreditsAvailable: 5_000,
  });
});

describe("credit recharge route", () => {
  it("rejects quantities outside configured 1,000-credit steps", async () => {
    const response = await POST(
      requestFor({
        action: "create",
        authToken: "token",
        credits: 5_001,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.verifyFirebaseIdToken).not.toHaveBeenCalled();
    expect(mocks.createRazorpayRechargeOrder).not.toHaveBeenCalled();
  });

  it("creates a server-priced Razorpay order", async () => {
    const response = await POST(
      requestFor({
        action: "create",
        authToken: "token",
        credits: 5_000,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.ensureBillingProfile).toHaveBeenCalledWith("user_test");
    expect(mocks.createRazorpayRechargeOrder).toHaveBeenCalledWith({
      userId: "user_test",
      credits: 5_000,
    });
    await expect(response.json()).resolves.toMatchObject({
      checkout: {
        keyId: "rzp_test_key",
        orderId: order.id,
        amountPaise: 49_500,
        credits: 5_000,
      },
    });
  });

  it("rejects a tampered checkout signature before fetching payment data", async () => {
    mocks.verifyRechargeCheckoutSignature.mockReturnValue(false);

    const response = await POST(
      requestFor({
        action: "verify",
        authToken: "token",
        razorpayPaymentId: payment.id,
        razorpayOrderId: order.id,
        razorpaySignature: "tampered",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.fetchRazorpayOrder).not.toHaveBeenCalled();
    expect(mocks.reconcileRechargePurchase).not.toHaveBeenCalled();
  });

  it("rejects an order owned by another user", async () => {
    mocks.getRechargeOrderDetails.mockReturnValue({
      userId: "other_user",
      credits: 5_000,
      amountPaise: 49_500,
    });

    const response = await POST(
      requestFor({
        action: "verify",
        authToken: "token",
        razorpayPaymentId: payment.id,
        razorpayOrderId: order.id,
        razorpaySignature: "valid",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.reconcileRechargePurchase).not.toHaveBeenCalled();
  });

  it("waits for both the payment capture and paid order state", async () => {
    mocks.fetchRazorpayOrder.mockResolvedValue({
      ...order,
      amount_paid: 0,
      status: "attempted",
    });

    const response = await POST(
      requestFor({
        action: "verify",
        authToken: "token",
        razorpayPaymentId: payment.id,
        razorpayOrderId: order.id,
        razorpaySignature: "valid",
      }),
    );

    expect(response.status).toBe(202);
    expect(mocks.reconcileRechargePurchase).not.toHaveBeenCalled();
  });

  it("grants captured recharge credits through an idempotent reconciliation", async () => {
    const response = await POST(
      requestFor({
        action: "verify",
        authToken: "token",
        razorpayPaymentId: payment.id,
        razorpayOrderId: order.id,
        razorpaySignature: "valid",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reconcileRechargePurchase).toHaveBeenCalledWith({
      userId: "user_test",
      orderId: order.id,
      paymentId: payment.id,
      creditsPurchased: 5_000,
      amountPaise: 49_500,
      purchasedAt: new Date(1_700_000_000_000),
      refundedPaise: 0,
    });
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      credited: true,
      duplicate: false,
      billing: { rechargeCreditsAvailable: 5_000 },
    });
  });
});
