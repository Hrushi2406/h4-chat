import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";
import { isValidReferralCode } from "@/lib/referral/code";
import { redeemReferralForSignup } from "@/lib/services/referral-server-service";
import { redeemReferralSchema } from "@/app/api/referral/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userId = await verifyFirebaseIdToken(
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    );
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const parsed = redeemReferralSchema.safeParse(await request.json());
    if (!parsed.success || !isValidReferralCode(parsed.data.code)) {
      return Response.json(
        { applied: false, reason: "invalid_code" },
        { status: 200 },
      );
    }

    const result = await redeemReferralForSignup({
      referredUserId: userId,
      code: parsed.data.code,
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Referral redeem failed:", error);
    return Response.json(
      { error: "Unable to apply referral" },
      { status: 500 },
    );
  }
}
