import { describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  CREDIT_RECHARGE,
  getRechargeCreditsToRevoke,
  getRechargePricePaise,
  isBillingPlanId,
  isPaidPlanId,
  isValidRechargeCredits,
} from "@/lib/billing/config";

describe("billing plan configuration", () => {
  it("keeps plan limits and prices in code", () => {
    expect(BILLING_PLANS.plus_monthly.pricePaise).toBe(39_900);
    expect(BILLING_PLANS.plus_monthly.monthlyCredits).toBe(10_000);
    expect(BILLING_PLANS.plus_monthly.creditMultiplier).toBe(2);
    expect(BILLING_PLANS.pro_annual.pricePaise).toBe(1_999_000);
    expect(BILLING_PLANS.pro_annual.monthlyCredits).toBe(50_000);
    expect(BILLING_PLANS.pro_annual.creditMultiplier).toBe(2);
    expect(BILLING_PLANS.free.creditMultiplier).toBe(7);
  });

  it("distinguishes public plan IDs from invalid input", () => {
    expect(isBillingPlanId("plus_monthly")).toBe(true);
    expect(isPaidPlanId("plus_monthly")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isBillingPlanId("admin_unlimited")).toBe(false);
  });
});

describe("one-time credit recharge configuration", () => {
  it("prices custom quantities in fixed 1,000-credit steps", () => {
    expect(CREDIT_RECHARGE.creditsPerUnit).toBe(1_000);
    expect(getRechargePricePaise(1_000)).toBe(9_900);
    expect(getRechargePricePaise(5_000)).toBe(49_500);
    expect(isValidRechargeCredits(1_000)).toBe(true);
    expect(isValidRechargeCredits(100_000)).toBe(true);
    expect(isValidRechargeCredits(1_001)).toBe(false);
    expect(isValidRechargeCredits(101_000)).toBe(false);
  });

  it("revokes recharge credits proportionally and rounds against over-crediting", () => {
    expect(
      getRechargeCreditsToRevoke({
        credits: 1_000,
        amountPaise: 9_900,
        refundedPaise: 4_950,
      }),
    ).toBe(500);
    expect(
      getRechargeCreditsToRevoke({
        credits: 1_000,
        amountPaise: 9_900,
        refundedPaise: 1,
      }),
    ).toBe(1);
    expect(
      getRechargeCreditsToRevoke({
        credits: 1_000,
        amountPaise: 9_900,
        refundedPaise: 9_900,
      }),
    ).toBe(1_000);
  });
});
