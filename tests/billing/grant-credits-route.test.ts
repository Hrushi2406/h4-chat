import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPLIMENTARY_ONE_TIME_CREDITS,
  DEFAULT_COMPLIMENTARY_GRANT_KEY,
} from "@/lib/billing/config";

const mocks = vi.hoisted(() => ({
  grantComplimentaryCredits: vi.fn(),
  toBillingSummary: vi.fn(),
  getUserByEmail: vi.fn(),
  firestoreGet: vi.fn(),
}));

vi.mock("@/lib/billing/server", () => ({
  grantComplimentaryCredits: mocks.grantComplimentaryCredits,
  toBillingSummary: mocks.toBillingSummary,
}));

vi.mock("@/lib/clients/firebase-admin", () => ({
  getAdminAuth: () => ({ getUserByEmail: mocks.getUserByEmail }),
  getAdminFirestore: () => ({
    collection: () => ({
      where: () => ({
        limit: () => ({ get: mocks.firestoreGet }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/billing/grant-credits/route";

const billingSummary = {
  permanentCreditsAvailable: 11_000,
  totalCreditsAvailable: 11_000,
};

const requestFor = (body: unknown, secret = "cron-secret") =>
  new Request("http://localhost/api/billing/grant-credits", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });

const originalCronSecret = process.env.BILLING_CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BILLING_CRON_SECRET = "cron-secret";
  mocks.grantComplimentaryCredits.mockResolvedValue({
    billing: { credits: { permanentAvailable: 11_000 } },
    duplicate: false,
    creditsGranted: COMPLIMENTARY_ONE_TIME_CREDITS,
    grantId: `complimentary_credit_grant_${DEFAULT_COMPLIMENTARY_GRANT_KEY}`,
  });
  mocks.toBillingSummary.mockReturnValue(billingSummary);
  mocks.getUserByEmail.mockResolvedValue({ uid: "user_from_email" });
  mocks.firestoreGet.mockResolvedValue({ docs: [] });
});

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.BILLING_CRON_SECRET;
    return;
  }
  process.env.BILLING_CRON_SECRET = originalCronSecret;
});

describe("complimentary credit grant route", () => {
  it("rejects requests without the billing cron secret", async () => {
    delete process.env.BILLING_CRON_SECRET;
    delete process.env.CRON_SECRET;

    const response = await POST(requestFor({ userId: "user_test" }));

    expect(response.status).toBe(503);
    expect(mocks.grantComplimentaryCredits).not.toHaveBeenCalled();
  });

  it("rejects an invalid cron secret", async () => {
    const response = await POST(
      requestFor({ userId: "user_test" }, "wrong-secret"),
    );

    expect(response.status).toBe(401);
    expect(mocks.grantComplimentaryCredits).not.toHaveBeenCalled();
  });

  it("requires a userId or email", async () => {
    const response = await POST(requestFor({ credits: 10_000 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "userId or email is required",
    });
    expect(mocks.grantComplimentaryCredits).not.toHaveBeenCalled();
  });

  it("grants 10,000 permanent credits once for a user id", async () => {
    const response = await POST(requestFor({ userId: "user_test" }));

    expect(response.status).toBe(200);
    expect(mocks.grantComplimentaryCredits).toHaveBeenCalledWith({
      userId: "user_test",
      credits: COMPLIMENTARY_ONE_TIME_CREDITS,
      grantKey: DEFAULT_COMPLIMENTARY_GRANT_KEY,
    });
    await expect(response.json()).resolves.toEqual({
      granted: true,
      duplicate: false,
      userId: "user_test",
      grantId: `complimentary_credit_grant_${DEFAULT_COMPLIMENTARY_GRANT_KEY}`,
      creditsGranted: 10_000,
      billing: billingSummary,
    });
  });

  it("resolves the user from email before granting", async () => {
    const response = await POST(
      requestFor({ email: "friend@trysakhi.com" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getUserByEmail).toHaveBeenCalledWith("friend@trysakhi.com");
    expect(mocks.grantComplimentaryCredits).toHaveBeenCalledWith({
      userId: "user_from_email",
      credits: COMPLIMENTARY_ONE_TIME_CREDITS,
      grantKey: DEFAULT_COMPLIMENTARY_GRANT_KEY,
    });
  });

  it("returns the existing grant without adding credits again", async () => {
    mocks.grantComplimentaryCredits.mockResolvedValue({
      billing: { credits: { permanentAvailable: 11_000 } },
      duplicate: true,
      creditsGranted: 0,
      grantId: `complimentary_credit_grant_${DEFAULT_COMPLIMENTARY_GRANT_KEY}`,
    });

    const response = await POST(requestFor({ userId: "user_test" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      granted: false,
      duplicate: true,
      creditsGranted: 0,
    });
  });

  it("returns 404 when the email does not match a user", async () => {
    mocks.getUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
    mocks.firestoreGet.mockResolvedValue({ docs: [] });

    const response = await POST(
      requestFor({ email: "missing@trysakhi.com" }),
    );

    expect(response.status).toBe(404);
    expect(mocks.grantComplimentaryCredits).not.toHaveBeenCalled();
  });
});
