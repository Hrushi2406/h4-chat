import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";
import { getOrCreateReferralSummary } from "@/lib/services/referral-server-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await verifyFirebaseIdToken(
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    );
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const referral = await getOrCreateReferralSummary(userId);
    return Response.json(
      { referral },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Referral summary failed:", error);
    return Response.json(
      { error: "Unable to load referral details" },
      { status: 500 },
    );
  }
}
