import { getCurrentBilling, toBillingSummary } from "@/lib/billing/server";
import { billingOperationalErrorResponse } from "@/lib/billing/error-response";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await verifyFirebaseIdToken(
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    );
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    const billing = await getCurrentBilling(userId);

    return Response.json(
      {
        billing: toBillingSummary(billing),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Billing summary failed:", error);
    return billingOperationalErrorResponse(
      error,
      "Unable to load billing information",
    );
  }
}
