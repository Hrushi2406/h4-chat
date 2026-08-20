import { describe, expect, it } from "vitest";
import { isValidReferralCode } from "@/lib/referral/code";
import { getReferralRedeemRejection } from "@/lib/referral/eligibility";
import { REFERRAL_CREDITS } from "@/lib/billing/config";

describe("referral codes", () => {
  it("accepts compact url-safe codes", () => {
    expect(isValidReferralCode("AbC123-_")).toBe(true);
    expect(isValidReferralCode("abcd12")).toBe(true);
  });

  it("rejects missing, short, or unsafe codes", () => {
    expect(isValidReferralCode("")).toBe(false);
    expect(isValidReferralCode("abc")).toBe(false);
    expect(isValidReferralCode("code with spaces")).toBe(false);
    expect(isValidReferralCode("code/slash")).toBe(false);
  });
});

describe("referral eligibility", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("blocks self-referrals and repeat redemptions", () => {
    expect(
      getReferralRedeemRejection({
        referredUserId: "user-1",
        referrerUserId: "user-1",
        createdAt: now.toISOString(),
        now,
      }),
    ).toBe("self");

    expect(
      getReferralRedeemRejection({
        referredUserId: "user-2",
        referrerUserId: "user-1",
        alreadyReferredBy: "user-1",
        createdAt: now.toISOString(),
        now,
      }),
    ).toBe("already_redeemed");
  });

  it("only rewards signups created within the redeem window", () => {
    expect(
      getReferralRedeemRejection({
        referredUserId: "user-2",
        referrerUserId: "user-1",
        createdAt: "2026-08-19T13:00:00.000Z",
        now,
      }),
    ).toBeUndefined();

    expect(
      getReferralRedeemRejection({
        referredUserId: "user-2",
        referrerUserId: "user-1",
        createdAt: "2026-08-19T11:00:00.000Z",
        now,
      }),
    ).toBe("not_new");

    expect(
      getReferralRedeemRejection({
        referredUserId: "user-2",
        referrerUserId: "user-1",
        now,
      }),
    ).toBe("not_new");
  });
});

describe("referral credit grant", () => {
  it("pays 500 credits to the person who shared the link", () => {
    expect(REFERRAL_CREDITS).toBe(500);
  });
});
