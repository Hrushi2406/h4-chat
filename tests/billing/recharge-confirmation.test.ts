import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn(),
}));

vi.mock("@/lib/clients/firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: mocks.getIdToken,
    },
  },
}));

import billingService, {
  type RechargeVerificationInput,
} from "@/lib/services/billing-service";

const verification: RechargeVerificationInput = {
  razorpayPaymentId: "pay_recharge",
  razorpayOrderId: "order_recharge",
  razorpaySignature: "signed_checkout",
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.getIdToken.mockResolvedValue("firebase_token");
});

describe("recharge confirmation", () => {
  it("rechecks the exact signed payment while Razorpay confirmation is pending", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    await expect(
      billingService.verifyRechargePurchase(verification),
    ).resolves.toEqual({ creditingPending: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify",
        authToken: "firebase_token",
        ...verification,
      }),
    });
  });

  it("finishes confirmation when that payment has been credited", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ verified: true, credited: true }),
    );

    await expect(
      billingService.verifyRechargePurchase(verification),
    ).resolves.toEqual({ creditingPending: false });
  });
});
