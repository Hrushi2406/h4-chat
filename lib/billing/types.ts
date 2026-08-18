import type { BillingPlanId } from "@/lib/billing/config";

export type BillingSubscriptionStatus =
  | "free"
  | "checkout_pending"
  | "active"
  | "payment_pending"
  | "past_due"
  | "paused"
  | "cancelled"
  | "expired"
  | "frozen";

export type BillingDate =
  | Date
  | string
  | number
  | { toDate(): Date }
  | null;

export type UserBilling = {
  planId: BillingPlanId;
  subscriptionStatus: BillingSubscriptionStatus;
  razorpayCustomerId: string | null;
  razorpaySubscriptionId: string | null;
  razorpaySubscriptionStatus: string | null;
  paidThrough: BillingDate;
  nextPaymentAt: BillingDate;
  cancelAtPeriodEnd: boolean;
  pendingPlanId: BillingPlanId | null;
  pendingPlanEffectiveAt: BillingDate;
  pendingRazorpaySubscriptionId: string | null;
  credits: {
    paidAvailable: number;
    permanentAvailable: number;
    rechargeAvailable: number;
    rechargeDebt: number;
    periodKey: string | null;
    nextRefreshAt: BillingDate;
  };
  updatedAt: BillingDate;
};

export type CreditUsageType =
  | "chat"
  | "automation"
  | "helper_generation";

export type CreditConsumptionEntry = {
  id: string;
  type: CreditUsageType;
  creditsConsumed: number;
  modelCostNanoUsd: number;
  toolCostNanoUsd: number;
  creditMultiplier: number;
  formulaVersion: number;
  rateVersion: number;
  createdAt: BillingDate;
};

export type CreditGrantEntry = {
  id: string;
  type:
    | "welcome_credit_grant"
    | "complimentary_credit_grant"
    | "paid_activation"
    | "credit_refresh"
    | "credit_revocation"
    | "recharge_credit_grant"
    | "recharge_credit_refund"
    | "recharge_credit_dispute";
  creditsGranted: number;
  creditsExpired: number;
  netCreditChange: number;
  planId: BillingPlanId;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  amountPaise?: number;
  rechargeCreditsPurchased?: number;
  rechargeRefundedPaise?: number;
  rechargeCreditsRevoked?: number;
  rechargeStatus?: "paid" | "partially_refunded" | "refunded" | "disputed";
  effectiveAt: BillingDate;
  processedAt: BillingDate;
};

export type CreditLedgerEntry = CreditConsumptionEntry | CreditGrantEntry;

export type DailyCreditUsage = {
  date: string;
  dateKey: string;
  timezone: string;
  totalCreditsConsumed: number;
  totalCreditsGranted: number;
  totalCreditsExpired: number;
  totalModelCostNanoUsd: number;
  totalToolCostNanoUsd: number;
  usage: CreditLedgerEntry[];
  createdAt: BillingDate;
  updatedAt: BillingDate;
};

export type BillingSummary = {
  planId: BillingPlanId;
  planName: string;
  interval: "none" | "monthly" | "annual";
  subscriptionStatus: BillingSubscriptionStatus;
  razorpaySubscriptionStatus: string | null;
  paidCreditsAvailable: number;
  permanentCreditsAvailable: number;
  rechargeCreditsAvailable: number;
  rechargeCreditDebt: number;
  totalCreditsAvailable: number;
  paidThrough: string | null;
  nextPaymentAt: string | null;
  nextRefreshAt: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanId: BillingPlanId | null;
  pendingPlanEffectiveAt: string | null;
};
