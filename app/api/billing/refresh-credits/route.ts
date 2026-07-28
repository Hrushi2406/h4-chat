import { timingSafeEqual } from "node:crypto";
import { refreshDueCredits } from "@/lib/billing/server";

export const dynamic = "force-dynamic";

const secureCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

async function refresh(request: Request) {
  const expected = (
    process.env.BILLING_CRON_SECRET ||
    process.env.CRON_SECRET
  )?.trim();
  const received =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!expected) {
    return Response.json(
      { error: "Billing refresh secret is not configured" },
      { status: 503 },
    );
  }
  if (!secureCompare(expected, received)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshDueCredits();
    return Response.json(result);
  } catch (error) {
    console.error("Monthly credit refresh failed:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Monthly credit refresh failed",
      },
      { status: 500 },
    );
  }
}

export const POST = refresh;
export const GET = refresh;
