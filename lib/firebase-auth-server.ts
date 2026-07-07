import { getAdminAuth } from "@/lib/clients/firebase-admin";

export async function verifyFirebaseIdToken(idToken?: string) {
  if (!idToken) {
    return undefined;
  }

  const auth = getAdminAuth();

  if (!auth) {
    return undefined;
  }

  try {
    // verifyIdToken validates the JWT signature locally against Google's
    // public keys (cached in-process), so this is a no-network call after
    // the first request that warms the key cache.
    const decoded = await auth.verifyIdToken(idToken);
    const provider = decoded.firebase?.sign_in_provider;

    if (provider === "anonymous") {
      return undefined;
    }

    return decoded.uid;
  } catch (error) {
    console.error(
      "Firebase token verification failed:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}
