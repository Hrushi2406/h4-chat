"use client";

import { auth } from "@/lib/clients/firebase";
import type {
  RedeemReferralResponse,
  ReferralSummaryResponse,
} from "@/app/api/referral/schema";

const getAuthToken = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to view your referral link");
  return token;
};

const readError = async (response: Response) => {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: string }
    | undefined;
  return body?.error || "Referral request failed";
};

class ReferralService {
  async getSummary(): Promise<ReferralSummaryResponse> {
    const authToken = await getAuthToken();
    const response = await fetch("/api/referral", {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));

    const result = (await response.json()) as {
      referral: ReferralSummaryResponse;
    };
    return result.referral;
  }

  async redeem(code: string): Promise<RedeemReferralResponse> {
    const authToken = await getAuthToken();
    const response = await fetch("/api/referral/redeem", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));

    return (await response.json()) as RedeemReferralResponse;
  }
}

const referralService = new ReferralService();
export default referralService;
