import {
  activatePaidPlan,
  getCurrentBilling,
  reconcileRechargePurchase,
  resolveCanonicalBillingUserId,
  revokePaidCredits,
  updateSubscriptionState,
} from "@/lib/billing/server";
import {
  cancelRazorpaySubscription,
  fetchRazorpayInvoice,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  fetchRazorpayPaymentRefunds,
  fetchRazorpaySubscription,
  getRechargeOrderDetails,
  getSubscriptionOwner,
  resolveInternalPlan,
  unixDate,
  verifyWebhookSignature,
  type RazorpayWebhook,
} from "@/lib/billing/razorpay";
import { billingOperationalErrorResponse } from "@/lib/billing/error-response";
import { notifyRechargeOnWhatsApp } from "@/lib/whatsapp/recharge-notifier";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    if (!verifyWebhookSignature({ rawBody, signature })) {
      return Response.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    const webhook = JSON.parse(rawBody) as RazorpayWebhook;
    const payment = webhook.payload?.payment?.entity;
    const refundPaymentId = webhook.payload?.refund?.entity?.payment_id;
    const disputePaymentId = webhook.payload?.dispute?.entity?.payment_id;
    const relatedPaymentId = refundPaymentId || disputePaymentId;
    const shouldFetchPayment =
      Boolean(relatedPaymentId) ||
      ["payment.captured", "order.paid"].includes(webhook.event);
    const authoritativePayment =
      shouldFetchPayment && (relatedPaymentId || payment?.id)
        ? await fetchRazorpayPayment(relatedPaymentId || payment!.id)
        : payment;
    const orderId =
      webhook.payload?.order?.entity?.id ??
      authoritativePayment?.order_id;
    if (orderId && authoritativePayment) {
      const order = await fetchRazorpayOrder(orderId);
      const recharge = getRechargeOrderDetails(order);
      if (recharge) {
        const rechargeUserId = await resolveCanonicalBillingUserId(recharge.userId);
        if (
          authoritativePayment.order_id !== order.id ||
          authoritativePayment.currency !== "INR" ||
          authoritativePayment.amount !== recharge.amountPaise
        ) {
          throw new Error("Recharge webhook payment does not match its order");
        }

        const refund = webhook.payload?.refund?.entity;
        let refundedPaise = authoritativePayment.amount_refunded;
        if (webhook.event === "refund.processed" && refund) {
          refundedPaise = await getProcessedRefundTotal({
            paymentId: authoritativePayment.id,
            paymentAmount: authoritativePayment.amount,
            paymentRefundedAmount: authoritativePayment.amount_refunded,
            currentRefundId: refund.id,
          });
        }

        const isDispute = webhook.event === "payment.dispute.created";
        const isCaptured =
          ["payment.captured", "order.paid"].includes(webhook.event) &&
          authoritativePayment.captured &&
          authoritativePayment.status === "captured" &&
          order.status === "paid" &&
          order.amount_paid === order.amount;
        const shouldReconcile =
          isCaptured ||
          isDispute ||
          (webhook.event === "refund.processed" && Boolean(refund));

        if (
          ["payment.captured", "order.paid"].includes(webhook.event) &&
          !isCaptured
        ) {
          throw new Error("Captured recharge is not confirmed by Razorpay yet");
        }
        if (!shouldReconcile) {
          return Response.json({ received: true, ignored: true });
        }

        await reconcileRechargePurchase({
          userId: rechargeUserId,
          orderId: order.id,
          paymentId: authoritativePayment.id,
          creditsPurchased: recharge.credits,
          amountPaise: recharge.amountPaise,
          purchasedAt: unixDate(order.created_at) ?? new Date(),
          refundedPaise,
          dispute: isDispute,
          eventId: refund?.id,
        });
        if (isCaptured) {
          await notifyRechargeOnWhatsApp({
            userId: rechargeUserId,
            orderId: order.id,
            credits: recharge.credits,
          }).catch((error) => {
            console.error("Failed to send WhatsApp recharge confirmation", {
              orderId: order.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
        return Response.json({ received: true });
      }
    }

    let subscriptionId =
      webhook.payload?.subscription?.entity?.id ??
      authoritativePayment?.subscription_id;

    if (!subscriptionId && authoritativePayment?.invoice_id) {
      const invoice = await fetchRazorpayInvoice(
        authoritativePayment.invoice_id,
      );
      subscriptionId = invoice.subscription_id ?? undefined;
    }

    if (!subscriptionId) {
      return Response.json({ received: true, ignored: true });
    }

    const subscription = await fetchRazorpaySubscription(subscriptionId);
    const ownerUserId = getSubscriptionOwner(subscription);
    const planId = resolveInternalPlan(subscription);
    if (!ownerUserId || !planId) {
      throw new Error("Webhook subscription is missing valid internal notes");
    }
    const userId = await resolveCanonicalBillingUserId(ownerUserId);

    const currentBilling = await getCurrentBilling(userId);
    const isPendingReplacement =
      currentBilling.pendingRazorpaySubscriptionId === subscriptionId &&
      currentBilling.pendingPlanId === planId;
    if (
      currentBilling.razorpaySubscriptionId &&
      currentBilling.razorpaySubscriptionId !== subscriptionId &&
      !isPendingReplacement
    ) {
      return Response.json({
        received: true,
        ignored: true,
        reason: "stale_subscription",
      });
    }

    if (webhook.event === "payment.dispute.created") {
      await cancelRazorpaySubscription(subscriptionId, false).catch((error) => {
        console.error("Failed to stop disputed subscription:", error);
      });
      await revokePaidCredits({
        userId,
        subscriptionId,
        reason: "dispute",
      });
      return Response.json({ received: true });
    }

    const refund = webhook.payload?.refund?.entity;
    let isFullyRefunded = false;
    if (
      webhook.event === "refund.processed" &&
      authoritativePayment &&
      refund
    ) {
      const observedRefundTotal = await getProcessedRefundTotal({
        paymentId: authoritativePayment.id,
        paymentAmount: authoritativePayment.amount,
        paymentRefundedAmount: authoritativePayment.amount_refunded,
        currentRefundId: refund.id,
      });
      isFullyRefunded = observedRefundTotal >= authoritativePayment.amount;
    }

    if (webhook.event === "refund.processed" && isFullyRefunded) {
      await cancelRazorpaySubscription(subscriptionId, false).catch((error) => {
        console.error("Failed to stop fully refunded subscription:", error);
      });
      await revokePaidCredits({
        userId,
        subscriptionId,
        reason: "full_refund",
      });
      return Response.json({ received: true });
    }

    const paidThrough = unixDate(subscription.current_end);
    const isSuccessfulCharge =
      webhook.event === "subscription.charged" &&
      subscription.status === "active" &&
      (!payment || payment.status === "captured" || payment.captured);
    const isSuccessfulPlanUpdate =
      webhook.event === "subscription.updated" &&
      subscription.status === "active";

    if ((isSuccessfulCharge || isSuccessfulPlanUpdate) && paidThrough) {
      if (
        isPendingReplacement &&
        currentBilling.razorpaySubscriptionId &&
        currentBilling.razorpaySubscriptionId !== subscriptionId
      ) {
        await cancelRazorpaySubscription(
          currentBilling.razorpaySubscriptionId,
          false,
        );
      }
      await activatePaidPlan({
        userId,
        planId,
        subscriptionId,
        customerId: subscription.customer_id,
        razorpayStatus: subscription.status,
        paidThrough,
        nextPaymentAt: unixDate(subscription.charge_at),
      });
    } else if (!isPendingReplacement) {
      await updateSubscriptionState({
        userId,
        subscriptionId,
        customerId: subscription.customer_id,
        razorpayStatus: subscription.status,
        paidThrough,
        nextPaymentAt: unixDate(subscription.charge_at),
      });
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook failed:", error);
    return billingOperationalErrorResponse(
      error,
      "Webhook processing failed",
    );
  }
}

async function getProcessedRefundTotal({
  paymentId,
  paymentAmount,
  paymentRefundedAmount,
  currentRefundId,
}: {
  paymentId: string;
  paymentAmount: number;
  paymentRefundedAmount: number;
  currentRefundId: string;
}) {
  const refunds = await fetchRazorpayPaymentRefunds(paymentId);
  const processedRefunds = refunds.filter(
    (item) => item.status === "processed",
  );
  const includesCurrentRefund = processedRefunds.some(
    (item) => item.id === currentRefundId,
  );
  if (!includesCurrentRefund) {
    // Razorpay can deliver refund.processed before its read APIs converge.
    // Returning 500 makes Razorpay retry instead of accepting an event whose
    // cumulative refund amount cannot yet be proven.
    throw new Error("Processed refund is not available from Razorpay yet");
  }
  const listedRefundTotal = processedRefunds.reduce(
    (total, item) => total + item.amount,
    0,
  );
  return Math.min(
    paymentAmount,
    Math.max(paymentRefundedAmount, listedRefundTotal),
  );
}
