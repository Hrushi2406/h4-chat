import { z } from "zod";
import {
  activatePaidPlan,
  attachCheckoutSubscription,
  clearPendingReplacementCheckout,
  clearFailedCheckout,
  clearTerminalCheckout,
  getCurrentBilling,
  markCancelAtPeriodEnd,
  setCheckoutPending,
  setPendingReplacementCheckout,
  toBillingSummary,
} from "@/lib/billing/server";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpayPayment,
  fetchRazorpaySubscription,
  getRazorpayPublicKeyId,
  getSubscriptionOwner,
  resolveInternalPlan,
  updateRazorpaySubscriptionPlan,
  unixDate,
  verifyCheckoutSignature,
} from "@/lib/billing/razorpay";
import {
  BILLING_PLANS,
  isPaidPlanId,
  type BillingPlanId,
} from "@/lib/billing/config";
import { verifyFirebaseIdToken } from "@/lib/firebase-auth-server";
import { billingOperationalErrorResponse } from "@/lib/billing/error-response";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  authToken: z.string().min(1),
  planId: z.string().refine(isPaidPlanId, "Invalid paid plan"),
});

const verifySchema = z.object({
  action: z.literal("verify"),
  authToken: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySubscriptionId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  authToken: z.string().min(1),
});

const changePlanSchema = z.object({
  action: z.literal("change_plan"),
  authToken: z.string().min(1),
  planId: z.string().refine(isPaidPlanId, "Invalid paid plan"),
});

const requestSchema = z.discriminatedUnion("action", [
  createSchema,
  verifySchema,
  cancelSchema,
  changePlanSchema,
]);

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid billing request" },
        { status: 400 },
      );
    }
    const userId = await verifyFirebaseIdToken(parsed.data.authToken);
    if (!userId) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }

    switch (parsed.data.action) {
      case "create":
        return createSubscription(userId, parsed.data.planId);
      case "verify":
        return verifySubscription(userId, parsed.data);
      case "cancel":
        return cancelSubscription(userId);
      case "change_plan":
        return changePlan(userId, parsed.data.planId);
    }
  } catch (error) {
    console.error("Billing subscription request failed:", error);
    return billingOperationalErrorResponse(error, "Billing request failed");
  }
}

async function createSubscription(
  userId: string,
  planId: Exclude<BillingPlanId, "free">,
) {
  const currentBilling = await getCurrentBilling(userId);
  if (currentBilling.subscriptionStatus === "checkout_pending") {
    if (!currentBilling.razorpaySubscriptionId) {
      return Response.json(
        {
          error:
            "A checkout is already being prepared. Please try again in a moment.",
        },
        { status: 409 },
      );
    }
    const existingSubscription = await fetchRazorpaySubscription(
      currentBilling.razorpaySubscriptionId,
    );
    const existingPlanId = resolveInternalPlan(existingSubscription);
    if (
      getSubscriptionOwner(existingSubscription) !== userId ||
      existingPlanId !== currentBilling.pendingPlanId
    ) {
      throw new Error("Existing Razorpay checkout does not match this account");
    }
    if (
      ["created", "authenticated"].includes(existingSubscription.status)
    ) {
      if (existingPlanId === planId) {
        return checkoutResponse(planId, existingSubscription.id);
      }
      await cancelRazorpaySubscription(existingSubscription.id, false);
      await clearTerminalCheckout({
        userId,
        subscriptionId: existingSubscription.id,
        razorpayStatus: "cancelled",
      });
    }
    else if (
      ["cancelled", "completed", "expired"].includes(
        existingSubscription.status,
      )
    ) {
      await clearTerminalCheckout({
        userId,
        subscriptionId: existingSubscription.id,
        razorpayStatus: existingSubscription.status,
      });
    } else {
      return Response.json(
        {
          error:
            "This subscription is already being processed by Razorpay. Refresh billing shortly.",
        },
        { status: 409 },
      );
    }
  }

  await setCheckoutPending({ userId, planId });

  try {
    const subscription = await createRazorpaySubscription({ userId, planId });
    try {
      await attachCheckoutSubscription({
        userId,
        subscriptionId: subscription.id,
        razorpayStatus: subscription.status,
      });
    } catch (error) {
      await cancelRazorpaySubscription(subscription.id, false).catch(
        (cleanupError) => {
          console.error("Failed to cancel orphaned checkout:", cleanupError);
        },
      );
      throw error;
    }
    return checkoutResponse(planId, subscription.id);
  } catch (error) {
    await clearFailedCheckout(userId).catch((cleanupError) => {
      console.error("Failed to clear checkout state:", cleanupError);
    });
    throw error;
  }
}

function checkoutResponse(
  planId: Exclude<BillingPlanId, "free">,
  subscriptionId: string,
) {
  const plan = BILLING_PLANS[planId];
  return Response.json({
    checkout: {
      keyId: getRazorpayPublicKeyId(),
      subscriptionId,
      name: "Sakhi AI",
      description: `${plan.name} ${plan.interval} subscription`,
      currency: "INR",
      amountPaise: plan.pricePaise,
    },
  });
}

async function verifySubscription(
  userId: string,
  input: z.infer<typeof verifySchema>,
) {
  if (
    !verifyCheckoutSignature({
      paymentId: input.razorpayPaymentId,
      subscriptionId: input.razorpaySubscriptionId,
      signature: input.razorpaySignature,
    })
  ) {
    return Response.json(
      { error: "Payment verification failed" },
      { status: 400 },
    );
  }

  const [subscription, payment, localBilling] = await Promise.all([
    fetchRazorpaySubscription(input.razorpaySubscriptionId),
    fetchRazorpayPayment(input.razorpayPaymentId),
    getCurrentBilling(userId),
  ]);
  const owner = getSubscriptionOwner(subscription);
  const planId = resolveInternalPlan(subscription);
  const isCurrentSubscription =
    localBilling.razorpaySubscriptionId === subscription.id;
  const isPendingReplacement =
    localBilling.pendingRazorpaySubscriptionId === subscription.id &&
    localBilling.pendingPlanId === planId;

  if (
    owner !== userId ||
    (!isCurrentSubscription && !isPendingReplacement) ||
    !planId
  ) {
    return Response.json(
      { error: "Subscription verification failed" },
      { status: 403 },
    );
  }
  if (
    payment.subscription_id &&
    payment.subscription_id !== subscription.id
  ) {
    return Response.json(
      { error: "Payment does not belong to this subscription" },
      { status: 400 },
    );
  }

  const plan = BILLING_PLANS[planId];
  if (
    !payment.captured ||
    payment.status !== "captured" ||
    payment.currency !== "INR" ||
    payment.amount !== plan.pricePaise
  ) {
    return Response.json(
      {
        verified: true,
        activated: false,
        message: "Payment is still being confirmed by Razorpay.",
      },
      { status: 202 },
    );
  }
  if (subscription.status !== "active") {
    return Response.json(
      {
        error:
          "The replacement payment completed, but Razorpay did not leave the subscription active. The current plan is unchanged.",
      },
      { status: 409 },
    );
  }

  const paidThrough = unixDate(subscription.current_end);
  if (!paidThrough) {
    return Response.json(
      {
        verified: true,
        activated: false,
        message: "Subscription period is still being confirmed by Razorpay.",
      },
      { status: 202 },
    );
  }

  if (
    isPendingReplacement &&
    localBilling.razorpaySubscriptionId &&
    localBilling.razorpaySubscriptionId !== subscription.id
  ) {
    await cancelRazorpaySubscription(
      localBilling.razorpaySubscriptionId,
      false,
    );
  }

  const billing = await activatePaidPlan({
    userId,
    planId,
    subscriptionId: subscription.id,
    customerId: subscription.customer_id,
    razorpayStatus: subscription.status,
    paidThrough,
    nextPaymentAt: unixDate(subscription.charge_at),
  });

  return Response.json({
    verified: true,
    activated: true,
    billing: toBillingSummary(billing),
  });
}

async function cancelSubscription(userId: string) {
  const billing = await getCurrentBilling(userId);
  if (!billing.razorpaySubscriptionId || billing.planId === "free") {
    return Response.json(
      { error: "No active paid subscription was found" },
      { status: 400 },
    );
  }

  const subscription = await cancelRazorpaySubscription(
    billing.razorpaySubscriptionId,
    true,
  );
  await markCancelAtPeriodEnd(userId, true);

  return Response.json({
    cancelledAtPeriodEnd: true,
    paidThrough: unixDate(subscription.current_end)?.toISOString() ?? null,
  });
}

async function changePlan(
  userId: string,
  planId: Exclude<BillingPlanId, "free">,
) {
  const billing = await getCurrentBilling(userId);
  if (!billing.razorpaySubscriptionId || billing.planId === "free") {
    return Response.json(
      { error: "Start a paid subscription before changing plans" },
      { status: 400 },
    );
  }
  if (billing.planId === planId) {
    return Response.json(
      { error: "You are already on this plan" },
      { status: 400 },
    );
  }

  if (billing.pendingRazorpaySubscriptionId) {
    const pendingSubscription = await fetchRazorpaySubscription(
      billing.pendingRazorpaySubscriptionId,
    );
    const pendingPlanId = resolveInternalPlan(pendingSubscription);
    if (
      getSubscriptionOwner(pendingSubscription) !== userId ||
      pendingPlanId !== billing.pendingPlanId
    ) {
      throw new Error("Pending plan checkout does not match this account");
    }
    if (
      ["created", "authenticated"].includes(pendingSubscription.status) &&
      pendingPlanId === planId
    ) {
      return checkoutResponse(planId, pendingSubscription.id);
    }
    if (
      ["cancelled", "completed", "expired"].includes(
        pendingSubscription.status,
      )
    ) {
      await clearPendingReplacementCheckout({
        userId,
        subscriptionId: pendingSubscription.id,
      });
    } else {
      return Response.json(
        { error: "Another plan change is already being processed" },
        { status: 409 },
      );
    }
  }

  let subscription;
  try {
    subscription = await updateRazorpaySubscriptionPlan({
      subscriptionId: billing.razorpaySubscriptionId,
      planId,
      scheduleChangeAt: "now",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const paymentMethodCannotChangePlan =
      message.includes(
        "Can't update subscription immediately when card mandate is applicable",
      ) ||
      message.includes(
        "Only offers can be updated for subscriptions when payment mode is",
      ) ||
      message.includes(
        "subscriptions cannot be updated when payment mode is",
      );
    if (paymentMethodCannotChangePlan) {
      const replacement = await createRazorpaySubscription({ userId, planId });
      try {
        await setPendingReplacementCheckout({
          userId,
          planId,
          subscriptionId: replacement.id,
        });
      } catch (replacementError) {
        await cancelRazorpaySubscription(replacement.id, false).catch(
          (cleanupError) => {
            console.error(
              "Failed to cancel orphaned replacement checkout:",
              cleanupError,
            );
          },
        );
        throw replacementError;
      }
      return checkoutResponse(planId, replacement.id);
    }
    throw error;
  }

  const resolvedPlanId = resolveInternalPlan(subscription);
  if (resolvedPlanId !== planId) {
    throw new Error("Razorpay did not apply the requested plan change");
  }
  if (subscription.status !== "active") {
    return Response.json(
      {
        updated: false,
        message: "Razorpay is still confirming the plan change.",
      },
      { status: 202 },
    );
  }
  const paidThrough = unixDate(subscription.current_end);
  if (!paidThrough) {
    throw new Error("Razorpay did not return the updated billing period");
  }

  const updatedBilling = await activatePaidPlan({
    userId,
    planId,
    subscriptionId: subscription.id,
    customerId: subscription.customer_id,
    razorpayStatus: subscription.status,
    paidThrough,
    nextPaymentAt: unixDate(subscription.charge_at),
  });

  return Response.json({
    updated: true,
    billing: toBillingSummary(updatedBilling),
  });
}
