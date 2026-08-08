import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Transaction,
} from "firebase-admin/firestore";
import { getModelById } from "@/lib/available-models";
import {
  BILLING_PLANS,
  BILLING_TIMEZONE,
  MODEL_RATES,
  WELCOME_CREDITS,
  getRechargeCreditsToRevoke,
  isBillingPlanId,
  isModelAllowedForPlan,
  type BillingPlanId,
} from "@/lib/billing/config";
export { toBillingSummary } from "@/lib/billing/summary";
import type { CreditCalculation } from "@/lib/billing/credits";
import {
  addOneCalendarMonthInIndia,
  asDate,
  getBillingDateKeys,
  getMonthlyAnniversaryOnOrAfterInIndia,
  getMonthlyCreditCycleInIndia,
} from "@/lib/billing/time";
import type {
  BillingSubscriptionStatus,
  CreditGrantEntry,
  CreditLedgerEntry,
  DailyCreditUsage,
  UserBilling,
} from "@/lib/billing/types";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";

const USERS_COLLECTION = "users";
const CREDIT_USAGE_COLLECTION = "creditUsage";
const REFRESH_BATCH_SIZE = 100;
const MAX_REFRESH_USERS_PER_INVOCATION = 500;

export class BillingAccessError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INSUFFICIENT_CREDITS"
      | "MODEL_NOT_ALLOWED"
      | "MODEL_RATE_MISSING"
      | "SUBSCRIPTION_INACTIVE",
    readonly status = 402,
  ) {
    super(message);
    this.name = "BillingAccessError";
  }
}

const getDb = () => {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin is not configured");
  return db;
};

const numberOrZero = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const nullableString = (value: unknown) =>
  typeof value === "string" && value ? value : null;

const normalizeStatus = (value: unknown): BillingSubscriptionStatus => {
  switch (value) {
    case "checkout_pending":
    case "active":
    case "payment_pending":
    case "past_due":
    case "paused":
    case "cancelled":
    case "expired":
    case "frozen":
      return value;
    default:
      return "free";
  }
};

export const createDefaultBilling = (now = new Date()): UserBilling => ({
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
  updatedAt: Timestamp.fromDate(now),
});

export const normalizeBilling = (
  value: unknown,
  now = new Date(),
): UserBilling => {
  if (!value || typeof value !== "object") {
    return createDefaultBilling(now);
  }

  const data = value as Record<string, unknown>;
  const credits =
    data.credits && typeof data.credits === "object"
      ? (data.credits as Record<string, unknown>)
      : {};
  const planId = isBillingPlanId(data.planId) ? data.planId : "free";

  return {
    planId,
    subscriptionStatus: normalizeStatus(data.subscriptionStatus),
    razorpayCustomerId: nullableString(data.razorpayCustomerId),
    razorpaySubscriptionId: nullableString(data.razorpaySubscriptionId),
    razorpaySubscriptionStatus: nullableString(
      data.razorpaySubscriptionStatus,
    ),
    paidThrough: (data.paidThrough as UserBilling["paidThrough"]) ?? null,
    nextPaymentAt: (data.nextPaymentAt as UserBilling["nextPaymentAt"]) ?? null,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    pendingPlanId: isBillingPlanId(data.pendingPlanId)
      ? data.pendingPlanId
      : null,
    pendingPlanEffectiveAt:
      (data.pendingPlanEffectiveAt as UserBilling["pendingPlanEffectiveAt"]) ??
      null,
    pendingRazorpaySubscriptionId: nullableString(
      data.pendingRazorpaySubscriptionId,
    ),
    credits: {
      paidAvailable: numberOrZero(credits.paidAvailable),
      permanentAvailable: numberOrZero(credits.permanentAvailable),
      rechargeAvailable: numberOrZero(credits.rechargeAvailable),
      rechargeDebt: numberOrZero(credits.rechargeDebt),
      periodKey: nullableString(credits.periodKey),
      nextRefreshAt:
        (credits.nextRefreshAt as UserBilling["credits"]["nextRefreshAt"]) ??
        null,
    },
    updatedAt: (data.updatedAt as UserBilling["updatedAt"]) ?? Timestamp.fromDate(now),
  };
};

const hasLedgerEntry = (
  usage: readonly CreditLedgerEntry[],
  entryId: string,
) => usage.some((entry) => entry.id === entryId);

const normalizeUsageArray = (value: unknown): CreditLedgerEntry[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is CreditLedgerEntry =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              typeof (entry as { id?: unknown }).id === "string",
          ),
      )
    : [];

const buildDailyUsage = ({
  existing,
  documentId,
  dateKey,
  entry,
  now,
}: {
  existing: DocumentData | undefined;
  documentId: string;
  dateKey: string;
  entry: CreditLedgerEntry;
  now: Date;
}): DailyCreditUsage => {
  const usage = normalizeUsageArray(existing?.usage);
  const createdAt = existing?.createdAt ?? Timestamp.fromDate(now);
  const isConsumption = "creditsConsumed" in entry;
  const isGrant = "creditsGranted" in entry;

  return {
    date: documentId,
    dateKey,
    timezone: BILLING_TIMEZONE,
    totalCreditsConsumed:
      numberOrZero(existing?.totalCreditsConsumed) +
      (isConsumption ? entry.creditsConsumed : 0),
    totalCreditsGranted:
      numberOrZero(existing?.totalCreditsGranted) +
      (isGrant ? entry.creditsGranted : 0),
    totalCreditsExpired:
      numberOrZero(existing?.totalCreditsExpired) +
      (isGrant ? entry.creditsExpired : 0),
    totalModelCostNanoUsd:
      numberOrZero(existing?.totalModelCostNanoUsd) +
      (isConsumption ? entry.modelCostNanoUsd : 0),
    totalToolCostNanoUsd:
      numberOrZero(existing?.totalToolCostNanoUsd) +
      (isConsumption ? entry.toolCostNanoUsd : 0),
    usage: [...usage, entry],
    createdAt,
    updatedAt: Timestamp.fromDate(now),
  };
};

const userRef = (userId: string) =>
  getDb().collection(USERS_COLLECTION).doc(userId);

const dailyUsageRef = (userId: string, documentId: string) =>
  userRef(userId).collection(CREDIT_USAGE_COLLECTION).doc(documentId);

type LegacyRechargePurchase = {
  orderId: string;
  creditsPurchased: number;
  amountPaise: number;
  refundedPaise: number;
  creditsRevoked: number;
  status: CreditGrantEntry["rechargeStatus"];
  purchasedAt: unknown;
};

const normalizeLegacyRechargePurchases = (
  value: unknown,
): Record<string, LegacyRechargePurchase> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(
      ([paymentId, purchase]) => {
        if (!purchase || typeof purchase !== "object") return [];
        const data = purchase as Record<string, unknown>;
        const orderId = nullableString(data.orderId);
        const status = String(data.status);
        if (
          !orderId ||
          !["paid", "partially_refunded", "refunded", "disputed"].includes(
            status,
          )
        ) {
          return [];
        }
        return [
          [
            paymentId,
            {
              orderId,
              creditsPurchased: numberOrZero(data.creditsPurchased),
              amountPaise: numberOrZero(data.amountPaise),
              refundedPaise: numberOrZero(data.refundedPaise),
              creditsRevoked: numberOrZero(data.creditsRevoked),
              status: status as LegacyRechargePurchase["status"],
              purchasedAt: data.purchasedAt,
            },
          ],
        ];
      },
    ),
  );
};

const migrateLegacyRechargePurchases = async (
  userId: string,
  now: Date,
) => {
  const db = getDb();
  const ref = userRef(userId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const legacy = normalizeLegacyRechargePurchases(
      snapshot.data()?.billing?.rechargePurchases,
    );
    const purchases = Object.entries(legacy);
    if (purchases.length === 0) {
      transaction.update(ref, {
        "billing.rechargePurchases": FieldValue.delete(),
      });
      return;
    }

    const ledgerRecords = await Promise.all(
      purchases.map(async ([paymentId, purchase]) => {
        const purchaseDate = asDate(purchase.purchasedAt) ?? now;
        const keys = getBillingDateKeys(purchaseDate);
        const ledgerRef = dailyUsageRef(userId, keys.documentId);
        const ledgerSnapshot = await transaction.get(ledgerRef);
        return {
          paymentId,
          purchase,
          purchaseDate,
          keys,
          ledgerRef,
          ledgerSnapshot,
        };
      }),
    );

    for (const record of ledgerRecords) {
      const usage = normalizeUsageArray(record.ledgerSnapshot.data()?.usage);
      const grantId = `recharge_credit_grant_${record.paymentId}`;
      const index = usage.findIndex((entry) => entry.id === grantId);
      const existing =
        index >= 0 ? (usage[index] as CreditGrantEntry) : undefined;
      const migrated: CreditGrantEntry = {
        id: grantId,
        type: "recharge_credit_grant",
        creditsGranted: existing?.creditsGranted ?? 0,
        creditsExpired: existing?.creditsExpired ?? 0,
        netCreditChange: existing?.netCreditChange ?? 0,
        planId: existing?.planId ?? "free",
        razorpayPaymentId: record.paymentId,
        razorpayOrderId: record.purchase.orderId,
        amountPaise: record.purchase.amountPaise,
        rechargeCreditsPurchased: record.purchase.creditsPurchased,
        rechargeRefundedPaise: record.purchase.refundedPaise,
        rechargeCreditsRevoked: record.purchase.creditsRevoked,
        rechargeStatus: record.purchase.status,
        effectiveAt:
          existing?.effectiveAt ?? Timestamp.fromDate(record.purchaseDate),
        processedAt: existing?.processedAt ?? Timestamp.fromDate(now),
      };
      const updatedUsage =
        index >= 0
          ? usage.map((entry, entryIndex) =>
              entryIndex === index ? migrated : entry,
            )
          : [...usage, migrated];

      transaction.set(
        record.ledgerRef,
        {
          ...(record.ledgerSnapshot.data() ?? {
            date: record.keys.documentId,
            dateKey: record.keys.dateKey,
            timezone: BILLING_TIMEZONE,
            totalCreditsConsumed: 0,
            totalCreditsGranted: 0,
            totalCreditsExpired: 0,
            totalModelCostNanoUsd: 0,
            totalToolCostNanoUsd: 0,
            createdAt: Timestamp.fromDate(record.purchaseDate),
          }),
          usage: updatedUsage,
          updatedAt: Timestamp.fromDate(now),
        },
      );
    }

    transaction.update(ref, {
      "billing.rechargePurchases": FieldValue.delete(),
    });
  });
};

export const ensureBillingProfile = async (
  userId: string,
  now = new Date(),
) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(ref);
    const existingBilling = userSnapshot.data()?.billing;
    if (existingBilling && typeof existingBilling === "object") {
      return normalizeBilling(existingBilling, now);
    }

    const keys = getBillingDateKeys(now);
    const ledgerRef = ref
      .collection(CREDIT_USAGE_COLLECTION)
      .doc(keys.documentId);
    const ledgerSnapshot = await transaction.get(ledgerRef);
    const billing = createDefaultBilling(now);
    const entryId = "welcome_credit_grant_v1";
    const existingUsage = normalizeUsageArray(ledgerSnapshot.data()?.usage);

    transaction.set(ref, { billing }, { merge: true });

    if (!hasLedgerEntry(existingUsage, entryId)) {
      const entry: CreditGrantEntry = {
        id: entryId,
        type: "welcome_credit_grant",
        creditsGranted: WELCOME_CREDITS,
        creditsExpired: 0,
        netCreditChange: WELCOME_CREDITS,
        planId: "free",
        effectiveAt: Timestamp.fromDate(now),
        processedAt: Timestamp.fromDate(now),
      };
      transaction.set(
        ledgerRef,
        buildDailyUsage({
          existing: ledgerSnapshot.data(),
          documentId: keys.documentId,
          dateKey: keys.dateKey,
          entry,
          now,
        }),
      );
    }

    return billing;
  });
};

const isPaidAccessValid = (billing: UserBilling, now: Date) => {
  if (billing.planId === "free") return true;
  if (billing.subscriptionStatus === "frozen") return false;

  const paidThrough = asDate(billing.paidThrough);
  return Boolean(paidThrough && paidThrough.getTime() > now.getTime());
};

const getPeriodKey = (
  subscriptionId: string,
  planId: BillingPlanId,
  anchorDay: number,
  periodDateKey: string,
) => `${subscriptionId}:${planId}:${anchorDay}:${periodDateKey}`;

const isLegacyPeriodKey = (periodKey: string | null) =>
  Boolean(periodKey && /^[^:]+:\d{4}-\d{2}$/.test(periodKey));

const getPeriodAnchorDay = (periodKey: string | null) => {
  const match = periodKey?.match(/^[^:]+:[^:]+:(\d{1,2}):\d{4}-\d{2}-\d{2}$/);
  const day = Number(match?.[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
};

const applyExpiredPaidAccess = async (
  userId: string,
  currentBilling: UserBilling,
  now: Date,
) => {
  if (
    currentBilling.planId === "free" ||
    isPaidAccessValid(currentBilling, now)
  ) {
    return currentBilling;
  }

  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (billing.planId === "free" || isPaidAccessValid(billing, now)) {
      return billing;
    }

    const updated: UserBilling = {
      ...billing,
      planId: "free",
      subscriptionStatus:
        billing.subscriptionStatus === "frozen" ? "frozen" : "expired",
      credits: {
        ...billing.credits,
        paidAvailable: 0,
        nextRefreshAt: null,
      },
      updatedAt: Timestamp.fromDate(now),
    };
    transaction.update(ref, { billing: updated });
    return updated;
  });
};

export const refreshCreditsForUser = async (
  userId: string,
  now = new Date(),
) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  const keys = getBillingDateKeys(now);
  const ledgerRef = ref
    .collection(CREDIT_USAGE_COLLECTION)
    .doc(keys.documentId);

  return db.runTransaction(async (transaction) => {
    const [userSnapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(ledgerRef),
    ]);
    const billing = normalizeBilling(userSnapshot.data()?.billing, now);

    if (billing.planId === "free" || !isPaidAccessValid(billing, now)) {
      if (billing.credits.nextRefreshAt) {
        const updated: UserBilling = {
          ...billing,
          credits: { ...billing.credits, nextRefreshAt: null },
          updatedAt: Timestamp.fromDate(now),
        };
        transaction.update(ref, { billing: updated });
        return { refreshed: false, billing: updated };
      }
      return { refreshed: false, billing };
    }

    const plan = BILLING_PLANS[billing.planId];
    const refreshDueAt = asDate(billing.credits.nextRefreshAt) ?? now;
    const providerAnchor =
      asDate(billing.nextPaymentAt) ??
      asDate(billing.paidThrough) ??
      refreshDueAt;
    const anchorDay =
      getPeriodAnchorDay(billing.credits.periodKey) ??
      Number(getBillingDateKeys(providerAnchor).dateKey.slice(-2));
    const legacyPeriod = isLegacyPeriodKey(billing.credits.periodKey);
    const cycle = getMonthlyCreditCycleInIndia({
      date: now,
      anchor: anchorDay,
    });
    const effectiveAt = legacyPeriod ? refreshDueAt : cycle.periodStart;
    const periodKey = getPeriodKey(
      billing.razorpaySubscriptionId ?? billing.planId,
      billing.planId,
      anchorDay,
      getBillingDateKeys(effectiveAt).dateKey,
    );
    const nextRefreshAt = legacyPeriod
      ? getMonthlyAnniversaryOnOrAfterInIndia({
          date: addOneCalendarMonthInIndia(refreshDueAt),
          anchor: anchorDay,
        })
      : cycle.nextRefreshAt;

    if (billing.credits.periodKey === periodKey) {
      const currentNextRefreshAt = asDate(billing.credits.nextRefreshAt);
      if (
        currentNextRefreshAt &&
        currentNextRefreshAt.getTime() === nextRefreshAt.getTime()
      ) {
        return { refreshed: false, billing };
      }
      const updated: UserBilling = {
        ...billing,
        credits: {
          ...billing.credits,
          nextRefreshAt: Timestamp.fromDate(nextRefreshAt),
        },
        updatedAt: Timestamp.fromDate(now),
      };
      transaction.update(ref, { billing: updated });
      return { refreshed: false, billing: updated };
    }

    const creditsExpired = billing.credits.paidAvailable;
    const creditsGranted = plan.monthlyCredits;
    const entryId = `credit_refresh_${periodKey}`;
    const existingUsage = normalizeUsageArray(ledgerSnapshot.data()?.usage);
    const updated: UserBilling = {
      ...billing,
      credits: {
        ...billing.credits,
        paidAvailable: creditsGranted,
        periodKey,
        nextRefreshAt: Timestamp.fromDate(nextRefreshAt),
      },
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.update(ref, { billing: updated });
    if (!hasLedgerEntry(existingUsage, entryId)) {
      const entry: CreditGrantEntry = {
        id: entryId,
        type: "credit_refresh",
        creditsGranted,
        creditsExpired,
        netCreditChange: creditsGranted - creditsExpired,
        planId: billing.planId,
        effectiveAt: Timestamp.fromDate(effectiveAt),
        processedAt: Timestamp.fromDate(now),
      };
      transaction.set(
        ledgerRef,
        buildDailyUsage({
          existing: ledgerSnapshot.data(),
          documentId: keys.documentId,
          dateKey: keys.dateKey,
          entry,
          now,
        }),
      );
    }

    return { refreshed: true, billing: updated };
  });
};

const getCurrentBillingContext = async (
  userId: string,
  now = new Date(),
) => {
  let snapshot = await userRef(userId).get();
  const userData = snapshot.data();
  const rawBilling = snapshot.data()?.billing;
  if (
    rawBilling &&
    typeof rawBilling === "object" &&
    Object.prototype.hasOwnProperty.call(rawBilling, "rechargePurchases")
  ) {
    await migrateLegacyRechargePurchases(userId, now);
    snapshot = await userRef(userId).get();
  }
  const existingBilling = snapshot.data()?.billing;
  let billing =
    existingBilling && typeof existingBilling === "object"
      ? normalizeBilling(existingBilling, now)
      : await ensureBillingProfile(userId, now);
  billing = await applyExpiredPaidAccess(userId, billing, now);

  const nextRefreshAt = asDate(billing.credits.nextRefreshAt);
  if (
    billing.planId !== "free" &&
    nextRefreshAt &&
    nextRefreshAt.getTime() <= now.getTime()
  ) {
    billing = (await refreshCreditsForUser(userId, now)).billing;
  }

  return { billing, userData };
};

export const getCurrentBilling = async (
  userId: string,
  now = new Date(),
) => (await getCurrentBillingContext(userId, now)).billing;

export const checkTaskAccess = async ({
  userId,
  modelId,
  enforceModelAccess = true,
  now = new Date(),
}: {
  userId: string;
  modelId: string;
  enforceModelAccess?: boolean;
  now?: Date;
}) => {
  const { billing, userData } = await getCurrentBillingContext(userId, now);
  const model = getModelById(modelId);

  if (!model || !MODEL_RATES[modelId]) {
    throw new BillingAccessError(
      "This model is temporarily unavailable for metered usage.",
      "MODEL_RATE_MISSING",
      400,
    );
  }

  if (enforceModelAccess && !isModelAllowedForPlan(billing.planId, model)) {
    throw new BillingAccessError(
      "Upgrade your plan to use this model.",
      "MODEL_NOT_ALLOWED",
      403,
    );
  }

  if (!isPaidAccessValid(billing, now)) {
    throw new BillingAccessError(
      "Your paid access has ended. Choose a plan to continue.",
      "SUBSCRIPTION_INACTIVE",
    );
  }

  const available =
    billing.credits.paidAvailable +
    billing.credits.permanentAvailable +
    billing.credits.rechargeAvailable;
  if (available <= 0) {
    throw new BillingAccessError(
      "You have used all your credits for this month.",
      "INSUFFICIENT_CREDITS",
    );
  }

  return {
    billing,
    plan: BILLING_PLANS[billing.planId],
    availableCredits: available,
    userData,
  };
};

export const deductCredits = async ({
  userId,
  calculation,
  now = new Date(),
}: {
  userId: string;
  calculation: CreditCalculation;
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(ref);
    const billing = normalizeBilling(userSnapshot.data()?.billing, now);
    let remaining = calculation.credits;
    const paidDeduction = Math.min(
      billing.credits.paidAvailable,
      remaining,
    );
    remaining -= paidDeduction;
    const permanentDeduction = Math.min(
      billing.credits.permanentAvailable,
      remaining,
    );
    remaining -= permanentDeduction;
    const rechargeDeduction = Math.min(
      billing.credits.rechargeAvailable,
      remaining,
    );

    const updated: UserBilling = {
      ...billing,
      credits: {
        ...billing.credits,
        paidAvailable: billing.credits.paidAvailable - paidDeduction,
        permanentAvailable:
          billing.credits.permanentAvailable - permanentDeduction,
        rechargeAvailable:
          billing.credits.rechargeAvailable - rechargeDeduction,
      },
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.update(ref, { billing: updated });

    return {
      billing: updated,
      deductedCredits:
        paidDeduction + permanentDeduction + rechargeDeduction,
      consumedCredits: calculation.credits,
    };
  });
};

export const reconcileRechargePurchase = async ({
  userId,
  orderId,
  paymentId,
  creditsPurchased,
  amountPaise,
  purchasedAt,
  refundedPaise = 0,
  dispute = false,
  eventId,
  now = new Date(),
}: {
  userId: string;
  orderId: string;
  paymentId: string;
  creditsPurchased: number;
  amountPaise: number;
  purchasedAt: Date;
  refundedPaise?: number;
  dispute?: boolean;
  eventId?: string;
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  const purchaseKeys = getBillingDateKeys(purchasedAt);
  const currentKeys = getBillingDateKeys(now);
  const purchaseLedgerRef = dailyUsageRef(
    userId,
    purchaseKeys.documentId,
  );
  const currentLedgerRef = dailyUsageRef(userId, currentKeys.documentId);
  const sameLedger = purchaseLedgerRef.path === currentLedgerRef.path;

  return db.runTransaction(async (transaction) => {
    const [snapshot, purchaseLedgerSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(purchaseLedgerRef),
    ]);
    const currentLedgerSnapshot = sameLedger
      ? purchaseLedgerSnapshot
      : await transaction.get(currentLedgerRef);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    const purchaseUsage = normalizeUsageArray(
      purchaseLedgerSnapshot.data()?.usage,
    );
    const grantId = `recharge_credit_grant_${paymentId}`;
    const grantIndex = purchaseUsage.findIndex(
      (entry) => entry.id === grantId,
    );
    const existingGrant =
      grantIndex >= 0
        ? (purchaseUsage[grantIndex] as CreditGrantEntry)
        : undefined;
    const existingCreditsPurchased =
      existingGrant?.rechargeCreditsPurchased ??
      existingGrant?.creditsGranted ??
      0;
    const existingAmountPaise = existingGrant?.amountPaise ?? 0;
    if (
      existingGrant &&
      (existingGrant.razorpayOrderId !== orderId ||
        existingGrant.razorpayPaymentId !== paymentId ||
        existingCreditsPurchased !== creditsPurchased ||
        existingAmountPaise !== amountPaise)
    ) {
      throw new Error("Recharge payment conflicts with its existing record");
    }

    const previousRefundedPaise =
      existingGrant?.rechargeRefundedPaise ?? 0;
    const previousCreditsRevoked =
      existingGrant?.rechargeCreditsRevoked ?? 0;
    const normalizedRefundedPaise = Math.min(
      amountPaise,
      Math.max(previousRefundedPaise, Math.floor(refundedPaise)),
    );
    const targetCreditsRevoked = dispute
      ? creditsPurchased
      : getRechargeCreditsToRevoke({
          credits: creditsPurchased,
          amountPaise,
          refundedPaise: normalizedRefundedPaise,
        });
    const creditsGranted = existingGrant ? 0 : creditsPurchased;
    const creditsRevoked = Math.max(
      0,
      targetCreditsRevoked - previousCreditsRevoked,
    );

    let rechargeAvailable = billing.credits.rechargeAvailable;
    let rechargeDebt = billing.credits.rechargeDebt;
    const debtSettled = Math.min(rechargeDebt, creditsGranted);
    rechargeDebt -= debtSettled;
    rechargeAvailable += creditsGranted - debtSettled;

    const availableRevoked = Math.min(rechargeAvailable, creditsRevoked);
    rechargeAvailable -= availableRevoked;
    rechargeDebt += creditsRevoked - availableRevoked;

    const status: NonNullable<CreditGrantEntry["rechargeStatus"]> = dispute
      ? "disputed"
      : targetCreditsRevoked >= creditsPurchased
        ? "refunded"
        : normalizedRefundedPaise > 0
          ? "partially_refunded"
          : "paid";
    const updated: UserBilling = {
      ...billing,
      credits: {
        ...billing.credits,
        rechargeAvailable,
        rechargeDebt,
      },
      updatedAt: Timestamp.fromDate(now),
    };

    const grantEntry: CreditGrantEntry = {
      id: grantId,
      type: "recharge_credit_grant",
      creditsGranted:
        existingGrant?.creditsGranted ?? creditsPurchased,
      creditsExpired: existingGrant?.creditsExpired ?? debtSettled,
      netCreditChange:
        existingGrant?.netCreditChange ?? creditsPurchased - debtSettled,
      planId: existingGrant?.planId ?? billing.planId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      amountPaise,
      rechargeCreditsPurchased: creditsPurchased,
      rechargeRefundedPaise: normalizedRefundedPaise,
      rechargeCreditsRevoked: targetCreditsRevoked,
      rechargeStatus: status,
      effectiveAt:
        existingGrant?.effectiveAt ?? Timestamp.fromDate(purchasedAt),
      processedAt: Timestamp.fromDate(now),
    };
    let purchaseLedgerData: DocumentData =
      grantIndex >= 0
        ? {
            ...(purchaseLedgerSnapshot.data() ?? {}),
            usage: purchaseUsage.map((entry, index) =>
              index === grantIndex ? grantEntry : entry,
            ),
            updatedAt: Timestamp.fromDate(now),
          }
        : buildDailyUsage({
            existing: purchaseLedgerSnapshot.data(),
            documentId: purchaseKeys.documentId,
            dateKey: purchaseKeys.dateKey,
            entry: grantEntry,
            now,
          });

    const reversalEntryId = dispute
      ? `recharge_credit_dispute_${paymentId}`
      : eventId
        ? `recharge_credit_refund_${eventId}`
        : `recharge_credit_refund_${paymentId}_${targetCreditsRevoked}`;
    if (creditsRevoked > 0) {
      const reversalEntry: CreditGrantEntry = {
        id: reversalEntryId,
        type: dispute
          ? "recharge_credit_dispute"
          : "recharge_credit_refund",
        creditsGranted: 0,
        creditsExpired: creditsRevoked,
        netCreditChange: -creditsRevoked,
        planId: billing.planId,
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        amountPaise: normalizedRefundedPaise,
        effectiveAt: Timestamp.fromDate(now),
        processedAt: Timestamp.fromDate(now),
      };
      if (sameLedger) {
        const sameDayUsage = normalizeUsageArray(purchaseLedgerData.usage);
        if (!hasLedgerEntry(sameDayUsage, reversalEntryId)) {
          purchaseLedgerData = buildDailyUsage({
            existing: purchaseLedgerData,
            documentId: currentKeys.documentId,
            dateKey: currentKeys.dateKey,
            entry: reversalEntry,
            now,
          });
        }
      } else {
        const currentUsage = normalizeUsageArray(
          currentLedgerSnapshot.data()?.usage,
        );
        if (!hasLedgerEntry(currentUsage, reversalEntryId)) {
          transaction.set(
            currentLedgerRef,
            buildDailyUsage({
              existing: currentLedgerSnapshot.data(),
              documentId: currentKeys.documentId,
              dateKey: currentKeys.dateKey,
              entry: reversalEntry,
              now,
            }),
          );
        }
      }
    }

    transaction.update(ref, { billing: updated });
    transaction.set(purchaseLedgerRef, purchaseLedgerData);

    return {
      billing: updated,
      recharge: {
        orderId,
        paymentId,
        creditsPurchased,
        amountPaise,
        refundedPaise: normalizedRefundedPaise,
        creditsRevoked: targetCreditsRevoked,
        status,
      },
      creditsGranted,
      creditsRevoked,
      duplicate: creditsGranted === 0 && creditsRevoked === 0,
    };
  });
};

export const activatePaidPlan = async ({
  userId,
  planId,
  subscriptionId,
  customerId,
  razorpayStatus,
  paidThrough,
  nextPaymentAt,
  now = new Date(),
}: {
  userId: string;
  planId: Exclude<BillingPlanId, "free">;
  subscriptionId: string;
  customerId?: string | null;
  razorpayStatus: string;
  paidThrough: Date;
  nextPaymentAt?: Date | null;
  now?: Date;
}) => {
  const db = getDb();
  const keys = getBillingDateKeys(now);
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  const ledgerRef = ref
    .collection(CREDIT_USAGE_COLLECTION)
    .doc(keys.documentId);

  return db.runTransaction(async (transaction) => {
    const [userSnapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(ledgerRef),
    ]);
    const billing = normalizeBilling(userSnapshot.data()?.billing, now);
    if (
      billing.razorpaySubscriptionId &&
      billing.razorpaySubscriptionId !== subscriptionId &&
      !(
        billing.pendingRazorpaySubscriptionId === subscriptionId &&
        billing.pendingPlanId === planId
      )
    ) {
      throw new Error("Subscription does not belong to this billing account");
    }
    const plan = BILLING_PLANS[planId];
    const isContinuingSubscription =
      billing.planId !== "free" &&
      billing.razorpaySubscriptionId === subscriptionId;
    const fallbackAnchor = isContinuingSubscription
      ? nextPaymentAt ?? paidThrough
      : now;
    const anchorDay =
      (isContinuingSubscription
        ? getPeriodAnchorDay(billing.credits.periodKey)
        : null) ??
      Number(getBillingDateKeys(fallbackAnchor).dateKey.slice(-2));
    const cycle = getMonthlyCreditCycleInIndia({
      date: now,
      anchor: anchorDay,
    });
    const periodKey = getPeriodKey(
      subscriptionId,
      planId,
      anchorDay,
      getBillingDateKeys(cycle.periodStart).dateKey,
    );
    const legacyCurrentMonthKey = `${planId}:${keys.monthKey}`;
    const nextRefreshAt = asDate(billing.credits.nextRefreshAt);
    const hasTransitionalCreditsForCycle =
      billing.planId === planId &&
      billing.razorpaySubscriptionId === subscriptionId &&
      nextRefreshAt !== null &&
      nextRefreshAt.getTime() > cycle.periodStart.getTime();
    const isCurrentPeriod =
      billing.credits.periodKey === periodKey ||
      billing.credits.periodKey === legacyCurrentMonthKey ||
      hasTransitionalCreditsForCycle;
    const shouldGrant = !isCurrentPeriod;
    const entryId =
      `paid_activation_${subscriptionId}_` +
      `${billing.credits.periodKey ?? "none"}_to_${periodKey}`;
    const isFrozenForThisPeriod =
      billing.subscriptionStatus === "frozen" &&
      isCurrentPeriod;
    const creditsExpired = shouldGrant
      ? billing.credits.paidAvailable
      : 0;
    const updated: UserBilling = {
      ...billing,
      planId,
      subscriptionStatus: isFrozenForThisPeriod ? "frozen" : "active",
      razorpayCustomerId: customerId ?? billing.razorpayCustomerId,
      razorpaySubscriptionId: subscriptionId,
      razorpaySubscriptionStatus: razorpayStatus,
      paidThrough: Timestamp.fromDate(paidThrough),
      nextPaymentAt: nextPaymentAt
        ? Timestamp.fromDate(nextPaymentAt)
        : null,
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      pendingPlanEffectiveAt: null,
      pendingRazorpaySubscriptionId: null,
      credits: {
        ...billing.credits,
        paidAvailable: isFrozenForThisPeriod
          ? 0
          : shouldGrant
            ? plan.monthlyCredits
            : billing.credits.paidAvailable,
        periodKey:
          shouldGrant || billing.credits.periodKey === legacyCurrentMonthKey
            ? periodKey
            : billing.credits.periodKey,
        nextRefreshAt: isFrozenForThisPeriod
          ? null
          : Timestamp.fromDate(cycle.nextRefreshAt),
      },
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.set(ref, { billing: updated }, { merge: true });

    const existingUsage = normalizeUsageArray(ledgerSnapshot.data()?.usage);
    if (
      shouldGrant &&
      !isFrozenForThisPeriod &&
      !hasLedgerEntry(existingUsage, entryId)
    ) {
      const entry: CreditGrantEntry = {
        id: entryId,
        type: "paid_activation",
        creditsGranted: plan.monthlyCredits,
        creditsExpired,
        netCreditChange: plan.monthlyCredits - creditsExpired,
        planId,
        effectiveAt: Timestamp.fromDate(now),
        processedAt: Timestamp.fromDate(now),
      };
      transaction.set(
        ledgerRef,
        buildDailyUsage({
          existing: ledgerSnapshot.data(),
          documentId: keys.documentId,
          dateKey: keys.dateKey,
          entry,
          now,
        }),
      );
    }

    return updated;
  });
};

export const updateSubscriptionState = async ({
  userId,
  subscriptionId,
  razorpayStatus,
  customerId,
  paidThrough,
  nextPaymentAt,
  now = new Date(),
}: {
  userId: string;
  subscriptionId: string;
  razorpayStatus: string;
  customerId?: string | null;
  paidThrough?: Date | null;
  nextPaymentAt?: Date | null;
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (
      billing.razorpaySubscriptionId &&
      billing.razorpaySubscriptionId !== subscriptionId
    ) {
      throw new Error("Subscription does not belong to this billing account");
    }

    // Refunds and disputes are terminal for the current subscription. Late
    // cancelled/updated webhooks must never restore a less-restrictive state.
    const isFrozen = billing.subscriptionStatus === "frozen";
    const status = isFrozen
      ? "frozen"
      : mapRazorpayStatus(razorpayStatus, billing);
    const isTerminal =
      !isFrozen &&
      ["cancelled", "completed", "expired"].includes(razorpayStatus);
    const updated: UserBilling = {
      ...billing,
      planId: isTerminal ? "free" : billing.planId,
      razorpayCustomerId: customerId ?? billing.razorpayCustomerId,
      razorpaySubscriptionId: subscriptionId,
      razorpaySubscriptionStatus: razorpayStatus,
      subscriptionStatus: status,
      paidThrough: isFrozen || isTerminal
        ? null
        : paidThrough
          ? Timestamp.fromDate(paidThrough)
          : billing.paidThrough,
      nextPaymentAt: isFrozen || isTerminal
        ? null
        : nextPaymentAt === undefined
          ? billing.nextPaymentAt
          : nextPaymentAt
            ? Timestamp.fromDate(nextPaymentAt)
            : null,
      cancelAtPeriodEnd: isTerminal ? false : billing.cancelAtPeriodEnd,
      pendingPlanId: isTerminal ? null : billing.pendingPlanId,
      pendingPlanEffectiveAt: isTerminal
        ? null
        : billing.pendingPlanEffectiveAt,
      pendingRazorpaySubscriptionId: isTerminal
        ? null
        : billing.pendingRazorpaySubscriptionId,
      credits:
        isTerminal
          ? {
              ...billing.credits,
              paidAvailable: 0,
              nextRefreshAt: null,
            }
          : billing.credits,
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.set(ref, { billing: updated }, { merge: true });
    return updated;
  });
};

const mapRazorpayStatus = (
  razorpayStatus: string,
  billing: UserBilling,
): BillingSubscriptionStatus => {
  switch (razorpayStatus) {
    case "active":
      return billing.planId === "free" ? "checkout_pending" : "active";
    case "pending":
      return "payment_pending";
    case "halted":
      return "past_due";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "completed":
    case "expired":
      return "expired";
    case "created":
    case "authenticated":
      return "checkout_pending";
    default:
      return billing.subscriptionStatus;
  }
};

export const setCheckoutPending = async ({
  userId,
  planId,
  now = new Date(),
}: {
  userId: string;
  planId: Exclude<BillingPlanId, "free">;
  now?: Date;
}) => {
  await ensureBillingProfile(userId, now);
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    const isTerminalAccount = ["frozen", "expired"].includes(
      billing.subscriptionStatus,
    );

    if (
      ["checkout_pending", "active", "payment_pending", "past_due"].includes(
        billing.subscriptionStatus,
      )
    ) {
      throw new Error("A subscription already exists for this account");
    }

    const updated: UserBilling = {
      ...billing,
      planId: isTerminalAccount ? "free" : billing.planId,
      subscriptionStatus: "checkout_pending",
      razorpaySubscriptionId: isTerminalAccount
        ? null
        : billing.razorpaySubscriptionId,
      razorpaySubscriptionStatus: isTerminalAccount
        ? null
        : billing.razorpaySubscriptionStatus,
      paidThrough: isTerminalAccount ? null : billing.paidThrough,
      nextPaymentAt: isTerminalAccount ? null : billing.nextPaymentAt,
      cancelAtPeriodEnd: isTerminalAccount
        ? false
        : billing.cancelAtPeriodEnd,
      pendingPlanId: planId,
      pendingPlanEffectiveAt: Timestamp.fromDate(now),
      pendingRazorpaySubscriptionId: null,
      credits: isTerminalAccount
        ? {
            ...billing.credits,
            paidAvailable: 0,
            periodKey: null,
            nextRefreshAt: null,
          }
        : billing.credits,
      updatedAt: Timestamp.fromDate(now),
    };
    transaction.update(ref, { billing: updated });
    return updated;
  });
};

export const attachCheckoutSubscription = async ({
  userId,
  subscriptionId,
  razorpayStatus,
  now = new Date(),
}: {
  userId: string;
  subscriptionId: string;
  razorpayStatus: string;
  now?: Date;
}) => {
  const ref = userRef(userId);
  await ref.update({
    "billing.razorpaySubscriptionId": subscriptionId,
    "billing.razorpaySubscriptionStatus": razorpayStatus,
    "billing.updatedAt": Timestamp.fromDate(now),
  });
};

export const clearFailedCheckout = async (
  userId: string,
  now = new Date(),
) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (
      billing.subscriptionStatus !== "checkout_pending" ||
      billing.razorpaySubscriptionId
    ) {
      return;
    }
    transaction.update(ref, {
      "billing.subscriptionStatus":
        billing.planId === "free" ? "free" : "active",
      "billing.pendingPlanId": null,
      "billing.pendingPlanEffectiveAt": null,
      "billing.pendingRazorpaySubscriptionId": null,
      "billing.updatedAt": Timestamp.fromDate(now),
    });
  });
};

export const clearTerminalCheckout = async ({
  userId,
  subscriptionId,
  razorpayStatus,
  now = new Date(),
}: {
  userId: string;
  subscriptionId: string;
  razorpayStatus: string;
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (
      billing.subscriptionStatus !== "checkout_pending" ||
      billing.razorpaySubscriptionId !== subscriptionId
    ) {
      return;
    }
    transaction.update(ref, {
      "billing.subscriptionStatus":
        billing.planId === "free" ? "free" : "active",
      "billing.razorpaySubscriptionId": null,
      "billing.razorpaySubscriptionStatus": razorpayStatus,
      "billing.pendingPlanId": null,
      "billing.pendingPlanEffectiveAt": null,
      "billing.pendingRazorpaySubscriptionId": null,
      "billing.updatedAt": Timestamp.fromDate(now),
    });
  });
};

export const setPendingPlanChange = async ({
  userId,
  planId,
  effectiveAt,
  now = new Date(),
}: {
  userId: string;
  planId: Exclude<BillingPlanId, "free">;
  effectiveAt: Date;
  now?: Date;
}) => {
  await userRef(userId).update({
    "billing.pendingPlanId": planId,
    "billing.pendingPlanEffectiveAt": Timestamp.fromDate(effectiveAt),
    "billing.updatedAt": Timestamp.fromDate(now),
  });
};

export const setPendingReplacementCheckout = async ({
  userId,
  planId,
  subscriptionId,
  now = new Date(),
}: {
  userId: string;
  planId: Exclude<BillingPlanId, "free">;
  subscriptionId: string;
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (
      billing.planId === "free" ||
      !billing.razorpaySubscriptionId ||
      !isPaidAccessValid(billing, now)
    ) {
      throw new Error("An active paid plan is required before changing plans");
    }
    if (
      billing.pendingRazorpaySubscriptionId &&
      billing.pendingRazorpaySubscriptionId !== subscriptionId
    ) {
      throw new Error("Another plan checkout is already in progress");
    }

    transaction.update(ref, {
      "billing.pendingPlanId": planId,
      "billing.pendingPlanEffectiveAt": Timestamp.fromDate(now),
      "billing.pendingRazorpaySubscriptionId": subscriptionId,
      "billing.updatedAt": Timestamp.fromDate(now),
    });
    return billing;
  });
};

export const clearPendingReplacementCheckout = async ({
  userId,
  subscriptionId,
  now = new Date(),
}: {
  userId: string;
  subscriptionId: string;
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (billing.pendingRazorpaySubscriptionId !== subscriptionId) return;
    transaction.update(ref, {
      "billing.pendingPlanId": null,
      "billing.pendingPlanEffectiveAt": null,
      "billing.pendingRazorpaySubscriptionId": null,
      "billing.updatedAt": Timestamp.fromDate(now),
    });
  });
};

export const markCancelAtPeriodEnd = async (
  userId: string,
  cancelAtPeriodEnd: boolean,
  now = new Date(),
) => {
  await userRef(userId).update({
    "billing.cancelAtPeriodEnd": cancelAtPeriodEnd,
    "billing.updatedAt": Timestamp.fromDate(now),
  });
};

export const revokePaidCredits = async ({
  userId,
  subscriptionId,
  reason,
  now = new Date(),
}: {
  userId: string;
  subscriptionId: string;
  reason: "full_refund" | "dispute";
  now?: Date;
}) => {
  const db = getDb();
  const ref = db.collection(USERS_COLLECTION).doc(userId);
  const keys = getBillingDateKeys(now);
  const ledgerRef = ref
    .collection(CREDIT_USAGE_COLLECTION)
    .doc(keys.documentId);
  return db.runTransaction(async (transaction) => {
    const [snapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(ledgerRef),
    ]);
    const billing = normalizeBilling(snapshot.data()?.billing, now);
    if (billing.razorpaySubscriptionId !== subscriptionId) {
      throw new Error("Subscription does not belong to this billing account");
    }
    const creditsRevoked = billing.credits.paidAvailable;
    const updated: UserBilling = {
      ...billing,
      subscriptionStatus: "frozen",
      paidThrough: null,
      nextPaymentAt: null,
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      pendingPlanEffectiveAt: null,
      pendingRazorpaySubscriptionId: null,
      credits: {
        ...billing.credits,
        paidAvailable: 0,
        nextRefreshAt: null,
      },
      updatedAt: Timestamp.fromDate(now),
    };
    transaction.update(ref, { billing: updated });
    const entryId = `credit_revocation_${reason}_${subscriptionId}`;
    const existingUsage = normalizeUsageArray(ledgerSnapshot.data()?.usage);
    if (!hasLedgerEntry(existingUsage, entryId)) {
      const entry: CreditGrantEntry = {
        id: entryId,
        type: "credit_revocation",
        creditsGranted: 0,
        creditsExpired: creditsRevoked,
        netCreditChange: -creditsRevoked,
        planId: billing.planId,
        effectiveAt: Timestamp.fromDate(now),
        processedAt: Timestamp.fromDate(now),
      };
      transaction.set(
        ledgerRef,
        buildDailyUsage({
          existing: ledgerSnapshot.data(),
          documentId: keys.documentId,
          dateKey: keys.dateKey,
          entry,
          now,
        }),
      );
    }
    return updated;
  });
};

export const getDailyCreditUsage = async (
  userId: string,
  documentId: string,
) => {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(documentId)) {
    throw new Error("Invalid credit usage date");
  }
  const snapshot = await dailyUsageRef(userId, documentId).get();
  return snapshot.exists ? snapshot.data() : null;
};

export const refreshDueCredits = async (now = new Date()) => {
  const db = getDb();
  let processed = 0;
  let refreshed = 0;

  while (processed < MAX_REFRESH_USERS_PER_INVOCATION) {
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where("billing.credits.nextRefreshAt", "<=", Timestamp.fromDate(now))
      .limit(
        Math.min(
          REFRESH_BATCH_SIZE,
          MAX_REFRESH_USERS_PER_INVOCATION - processed,
        ),
      )
      .get();

    if (snapshot.empty) break;
    const results = await Promise.all(
      snapshot.docs.map((doc) => refreshCreditsForUser(doc.id, now)),
    );
    processed += snapshot.size;
    refreshed += results.filter((result) => result.refreshed).length;
  }

  return {
    processed,
    refreshed,
    capped: processed >= MAX_REFRESH_USERS_PER_INVOCATION,
  };
};

export const getAutomationLimitForUser = async (userId: string) => {
  const billing = await getCurrentBilling(userId);
  return BILLING_PLANS[billing.planId].automationLimit;
};

export const getConnectionLimitForUser = async (userId: string) => {
  const billing = await getCurrentBilling(userId);
  return BILLING_PLANS[billing.planId].connectionLimit;
};

export const getCreditMultiplier = (planId: BillingPlanId) =>
  BILLING_PLANS[planId].creditMultiplier;

export const runBillingTransaction = <T>(
  callback: (transaction: Transaction) => Promise<T>,
) => getDb().runTransaction(callback);
