export const REFERRAL_CODE_MIN_LENGTH = 6;
export const REFERRAL_CODE_MAX_LENGTH = 16;
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

export const isValidReferralCode = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= REFERRAL_CODE_MIN_LENGTH &&
  value.length <= REFERRAL_CODE_MAX_LENGTH &&
  REFERRAL_CODE_PATTERN.test(value);
