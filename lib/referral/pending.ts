const PENDING_REFERRAL_STORAGE_KEY = "h4:pending-referral-code";

export const persistPendingReferralCode = (code: string) => {
  try {
    window.localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, code);
  } catch {
    // Private mode or blocked storage — signup simply won't apply a referral.
  }
};

export const getPendingReferralCode = (): string | undefined => {
  try {
    return window.localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
};

export const clearPendingReferralCode = () => {
  try {
    window.localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the code will expire with the redeem window.
  }
};
