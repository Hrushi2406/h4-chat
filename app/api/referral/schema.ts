import { z } from "zod";
import {
  REFERRAL_CODE_MAX_LENGTH,
  REFERRAL_CODE_MIN_LENGTH,
} from "@/lib/referral/code";

export const redeemReferralSchema = z.object({
  code: z
    .string()
    .trim()
    .min(REFERRAL_CODE_MIN_LENGTH)
    .max(REFERRAL_CODE_MAX_LENGTH),
});

export type ReferralSummaryResponse = {
  code: string;
  successfulReferrals: number;
  creditsEarned: number;
  creditsPerReferral: number;
};

export type RedeemReferralInput = {
  code: string;
};

export type RedeemReferralResponse = {
  applied: boolean;
  reason?: "self" | "already_redeemed" | "not_new" | "invalid_code";
};
