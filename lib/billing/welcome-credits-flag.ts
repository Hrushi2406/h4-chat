// Client-only signal: set right after a brand-new user doc is created so the
// welcome credits modal can show itself once on the next authenticated render.
const storageKey = (uid: string) => `h4:welcome-credits-pending:${uid}`;

export const markWelcomeCreditsPending = (uid: string) => {
  try {
    window.localStorage.setItem(storageKey(uid), "1");
  } catch {
    // Storage may be unavailable (private mode, etc.) — modal simply won't show.
  }
};

export const consumeWelcomeCreditsPending = (uid: string): boolean => {
  try {
    const key = storageKey(uid);
    const isPending = window.localStorage.getItem(key) === "1";
    if (isPending) window.localStorage.removeItem(key);
    return isPending;
  } catch {
    return false;
  }
};
