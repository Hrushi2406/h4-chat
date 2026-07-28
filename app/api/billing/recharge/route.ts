import { z } from "zod";
import {
  CREDIT_RECHARGE,
  getRechargePricePaise,
  isValidRechargeCredits,
} from "@/lib/billing/config";
import {
  ensureBillingProfile,
  reconcileRechargePurchase,
  toBillingSummary,
} from "@/lib/billing/server";
import {
  createRazorpayRechargeOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayPublicKeyId,
  getRechargeOrderDetails,
  verifyRechargeCheckoutSignature,
} from "@/lib/billing/razorpay";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  authToken: z.string().min(1),
  credits: z.number().int().refine(isValidRechargeCredits, {
    message: `Credits must be purchased in ${CREDIT_RECHARGE.creditsPerUnit.toLocaleString("en-IN")}-credit steps`,
  }),
});

const verifySchema = z.object({
  action: z.literal("verify"),
  authToken: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

const requestSchema = z.discriminatedUnion("action", [
  createSchema,
  verifySchema,
]);

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid recharge request",
        },
        { status: 400 },
      );
    }
    const userId = await verifyFirebaseIdToken(parsed.data.authToken);
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    return parsed.data.action === "create"
      ? createRecharge(userId, parsed.data.credits)
      : verifyRecharge(userId, parsed.data);
  } catch (error) {
    console.error("Credit recharge request failed:", error);
    const message =
      error instanceof Error ? error.message : "Recharge request failed";
    const status =
      message.includes("not configured") || message.includes("credentials")
        ? 503
        : 500;
    return Response.json({ error: message }, { status });
  }
}

async function createRecharge(userId: string, credits: number) {
  await ensureBillingProfile(userId);
  const order = await createRazorpayRechargeOrder({ userId, credits });
  const details = getRechargeOrderDetails(order);
  if (!details || details.userId !== userId) {
    throw new Error("Razorpay returned an invalid recharge order");
  }

  return Response.json({
    checkout: {
      keyId: getRazorpayPublicKeyId(),
      orderId: order.id,
      name: "Sakhi AI",
      description: `${credits.toLocaleString("en-IN")} non-expiring credits`,
      currency: "INR",
      amountPaise: getRechargePricePaise(credits),
      credits,
    },
  });
}

async function verifyRecharge(
  userId: string,
  input: z.infer<typeof verifySchema>,
) {
  if (
    !verifyRechargeCheckoutSignature({
      paymentId: input.razorpayPaymentId,
      orderId: input.razorpayOrderId,
      signature: input.razorpaySignature,
    })
  ) {
    return Response.json(
      { error: "Payment verification failed" },
      { status: 400 },
    );
  }

  const [order, payment] = await Promise.all([
    fetchRazorpayOrder(input.razorpayOrderId),
    fetchRazorpayPayment(input.razorpayPaymentId),
  ]);
  const details = getRechargeOrderDetails(order);
  if (!details || details.userId !== userId) {
    return Response.json(
      { error: "Recharge order does not belong to this account" },
      { status: 403 },
    );
  }
  if (
    payment.order_id !== order.id ||
    payment.currency !== "INR" ||
    payment.amount !== details.amountPaise
  ) {
    return Response.json(
      { error: "Payment does not match the recharge order" },
      { status: 400 },
    );
  }
  if (
    !payment.captured ||
    payment.status !== "captured" ||
    order.status !== "paid" ||
    order.amount_paid !== order.amount
  ) {
    return Response.json(
      {
        verified: true,
        credited: false,
        message: "Payment is still being confirmed by Razorpay.",
      },
      { status: 202 },
    );
  }

  const result = await reconcileRechargePurchase({
    userId,
    orderId: order.id,
    paymentId: payment.id,
    creditsPurchased: details.credits,
    amountPaise: details.amountPaise,
    purchasedAt: new Date(order.created_at * 1_000),
    refundedPaise: payment.amount_refunded,
  });

  return Response.json({
    verified: true,
    credited: true,
    duplicate: result.duplicate,
    billing: toBillingSummary(result.billing),
  });
}
