import type { Analytics } from "firebase/analytics";
import app from "@/lib/clients/firebase";

let analyticsPromise: Promise<Analytics | null> | undefined;

export const getFirebaseAnalytics = () => {
  if (analyticsPromise) return analyticsPromise;

  analyticsPromise = (async () => {
    if (
      typeof window === "undefined" ||
      !process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    ) {
      return null;
    }

    const { getAnalytics, isSupported } = await import("firebase/analytics");
    return (await isSupported()) ? getAnalytics(app) : null;
  })();

  return analyticsPromise;
};
