type FirebaseLookupResponse = {
  users?: Array<{
    localId: string;
  }>;
  error?: {
    message?: string;
  };
};

export async function verifyFirebaseIdToken(idToken?: string) {
  if (!idToken) {
    return undefined;
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  const data = (await response.json()) as FirebaseLookupResponse;

  if (!response.ok || !data.users?.[0]?.localId) {
    console.error("Firebase token verification failed:", data.error?.message);
    return undefined;
  }

  return data.users[0].localId;
}
