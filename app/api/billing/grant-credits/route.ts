import { timingSafeEqual } from "node:crypto";
import {
  getAdminAuth,
  getAdminFirestore,
} from "@/lib/clients/firebase-admin";
import { billingOperationalErrorResponse } from "@/lib/billing/error-response";
import {
  grantComplimentaryCredits,
  toBillingSummary,
} from "@/lib/billing/server";
import {
  grantCreditsRequestSchema,
  type GrantCreditsResponse,
} from "@/app/api/billing/grant-credits/schema";

export const dynamic = "force-dynamic";

const secureCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const authorizeGrant = (request: Request) => {
  const expected = (
    process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET
  )?.trim();
  const received =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!expected) {
    return Response.json(
      { error: "Credit grants are temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!secureCompare(expected, received)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return undefined;
};

const isAuthUserNotFound = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "auth/user-not-found";
};

const resolveUserId = async ({
  userId,
  email,
}: {
  userId?: string;
  email?: string;
}) => {
  if (userId) return userId;
  if (!email) return undefined;

  const auth = getAdminAuth();
  if (auth) {
    try {
      return (await auth.getUserByEmail(email)).uid;
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
  }

  const db = getAdminFirestore();
  if (!db) return undefined;

  const snapshot = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  return snapshot.docs[0]?.id;
};

export async function POST(request: Request) {
  const unauthorized = authorizeGrant(request);
  if (unauthorized) return unauthorized;

  try {
    const parsed = grantCreditsRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid credit grant request",
        },
        { status: 400 },
      );
    }

    const userId = await resolveUserId(parsed.data);
    if (!userId) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const result = await grantComplimentaryCredits({
      userId,
      credits: parsed.data.credits,
      grantKey: parsed.data.grantKey,
    });
    const body: GrantCreditsResponse = {
      granted: !result.duplicate,
      duplicate: result.duplicate,
      userId,
      grantId: result.grantId,
      creditsGranted: result.creditsGranted,
      billing: toBillingSummary(result.billing),
    };

    return Response.json(body);
  } catch (error) {
    console.error("Complimentary credit grant failed:", error);
    return billingOperationalErrorResponse(
      error,
      "Unable to grant complimentary credits",
    );
  }
}
