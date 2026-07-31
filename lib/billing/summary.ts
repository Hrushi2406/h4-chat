import { BILLING_PLANS, WELCOME_CREDITS } from "@/lib/billing/config";
import type {
  BillingDate,
  BillingSummary,
  UserBilling,
} from "@/lib/billing/types";

const dateToIso = (value: BillingDate) => {
  if (value === null) return null;

  const date =
    value instanceof Date
      ? value
      : typeof value === "object" && "toDate" in value
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const createDefaultClientBilling = (
  now = new Date(),
): UserBilling => ({
  planId: "free",
  subscriptionStatus: "free",
  razorpayCustomerId: null,
  razorpaySubscriptionId: null,
  razorpaySubscriptionStatus: null,
  paidThrough: null,
  nextPaymentAt: null,
  cancelAtPeriodEnd: false,
  pendingPlanId: null,
  pendingPlanEffectiveAt: null,
  pendingRazorpaySubscriptionId: null,
  credits: {
    paidAvailable: 0,
    permanentAvailable: WELCOME_CREDITS,
    rechargeAvailable: 0,
    rechargeDebt: 0,
    periodKey: null,
    nextRefreshAt: null,
  },
  updatedAt: now,
});

export const toBillingSummary = (billing: UserBilling): BillingSummary => {
  const plan = BILLING_PLANS[billing.planId];

  return {
    planId: billing.planId,
    planName: plan.name,
    interval: plan.interval,
    subscriptionStatus: billing.subscriptionStatus,
    razorpaySubscriptionStatus: billing.razorpaySubscriptionStatus,
    paidCreditsAvailable: billing.credits.paidAvailable,
    permanentCreditsAvailable: billing.credits.permanentAvailable,
    rechargeCreditsAvailable: billing.credits.rechargeAvailable,
    rechargeCreditDebt: billing.credits.rechargeDebt,
    totalCreditsAvailable:
      billing.credits.paidAvailable +
      billing.credits.permanentAvailable +
      billing.credits.rechargeAvailable,
    paidThrough: dateToIso(billing.paidThrough),
    nextPaymentAt: dateToIso(billing.nextPaymentAt),
    nextRefreshAt: dateToIso(billing.credits.nextRefreshAt),
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    pendingPlanId: billing.pendingPlanId,
    pendingPlanEffectiveAt: dateToIso(billing.pendingPlanEffectiveAt),
  };
};
