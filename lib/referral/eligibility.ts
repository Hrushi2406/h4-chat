export const REFERRAL_REDEEM_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReferralRedeemRejection =
  | "self"
  | "already_redeemed"
  | "not_new"
  | "invalid_code";

export const getReferralRedeemRejection = ({
  referredUserId,
  referrerUserId,
  alreadyReferredBy,
  createdAt,
  now = new Date(),
}: {
  referredUserId: string;
  referrerUserId: string;
  alreadyReferredBy?: string;
  createdAt?: string;
  now?: Date;
}): ReferralRedeemRejection | undefined => {
  if (!referrerUserId || referredUserId === referrerUserId) return "self";
  if (alreadyReferredBy) return "already_redeemed";

  if (!createdAt) return "not_new";
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return "not_new";
  if (now.getTime() - createdAtMs > REFERRAL_REDEEM_WINDOW_MS) return "not_new";

  return undefined;
};
