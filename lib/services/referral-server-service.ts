import "server-only";

import { randomBytes } from "node:crypto";
import {
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { BILLING_TIMEZONE, REFERRAL_CREDITS } from "@/lib/billing/config";
import {
  createDefaultBilling,
  ensureBillingProfile,
  normalizeBilling,
} from "@/lib/billing/server";
import { getBillingDateKeys } from "@/lib/billing/time";
import type {
  CreditGrantEntry,
  CreditLedgerEntry,
  DailyCreditUsage,
  UserBilling,
} from "@/lib/billing/types";
import { getAdminFirestore } from "@/lib/clients/firebase-admin";
import { isValidReferralCode } from "@/lib/referral/code";
import {
  getReferralRedeemRejection,
  type ReferralRedeemRejection,
} from "@/lib/referral/eligibility";
import type { UserReferral } from "@/lib/types/user";

const USERS_COLLECTION = "users";
const REFERRAL_CODES_COLLECTION = "referralCodes";
const CREDIT_USAGE_COLLECTION = "creditUsage";
const CODE_CREATE_ATTEMPTS = 5;

const getDb = () => {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin is not configured");
  return db;
};

const numberOrZero = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const normalizeReferral = (value: unknown): UserReferral => {
  if (!value || typeof value !== "object") {
    return {
      successfulReferrals: 0,
      creditsEarned: 0,
    };
  }

  const data = value as Record<string, unknown>;
  return {
    ...(typeof data.code === "string" && data.code ? { code: data.code } : {}),
    ...(typeof data.referredBy === "string" && data.referredBy
      ? { referredBy: data.referredBy }
      : {}),
    ...(typeof data.referredAt === "string" && data.referredAt
      ? { referredAt: data.referredAt }
      : {}),
    successfulReferrals: numberOrZero(data.successfulReferrals),
    creditsEarned: numberOrZero(data.creditsEarned),
  };
};

const generateReferralCode = () => randomBytes(6).toString("base64url");

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

const createReferralCodeForUser = async (userId: string) => {
  const db = getDb();
  const userRef = db.collection(USERS_COLLECTION).doc(userId);

  for (let attempt = 0; attempt < CODE_CREATE_ATTEMPTS; attempt += 1) {
    const code = generateReferralCode();
    const codeRef = db.collection(REFERRAL_CODES_COLLECTION).doc(code);

    try {
      await db.runTransaction(async (transaction) => {
        const [userSnapshot, codeSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(codeRef),
        ]);
        const referral = normalizeReferral(userSnapshot.data()?.referral);
        if (referral.code) {
          return;
        }
        if (codeSnapshot.exists) {
          throw Object.assign(new Error("Referral code already exists"), {
            code: "already-exists",
          });
        }

        transaction.create(codeRef, {
          code,
          userId,
          createdAt: new Date().toISOString(),
        });
        transaction.set(
          userRef,
          {
            referral: {
              ...referral,
              code,
            },
          },
          { merge: true },
        );
      });

      const snapshot = await userRef.get();
      const referral = normalizeReferral(snapshot.data()?.referral);
      if (referral.code) return referral;
    } catch (error) {
      const errorCode = (error as { code?: number | string }).code;
      if (errorCode !== 6 && errorCode !== "already-exists") throw error;
    }
  }

  throw new Error("Could not generate a unique referral code");
};

export const getOrCreateReferralSummary = async (userId: string) => {
  const db = getDb();
  const snapshot = await db.collection(USERS_COLLECTION).doc(userId).get();
  let referral = normalizeReferral(snapshot.data()?.referral);

  if (!referral.code) {
    referral = await createReferralCodeForUser(userId);
  }

  if (!referral.code) {
    throw new Error("Referral code is unavailable");
  }

  return {
    code: referral.code,
    successfulReferrals: referral.successfulReferrals,
    creditsEarned: referral.creditsEarned,
    creditsPerReferral: REFERRAL_CREDITS,
  };
};

export const redeemReferralForSignup = async ({
  referredUserId,
  code,
  now = new Date(),
}: {
  referredUserId: string;
  code: string;
  now?: Date;
}): Promise<{ applied: boolean; reason?: ReferralRedeemRejection }> => {
  if (!isValidReferralCode(code)) {
    return { applied: false, reason: "invalid_code" };
  }

  const db = getDb();
  const codeRef = db.collection(REFERRAL_CODES_COLLECTION).doc(code);
  const codeSnapshot = await codeRef.get();
  const referrerUserId =
    typeof codeSnapshot.data()?.userId === "string"
      ? codeSnapshot.data()?.userId
      : undefined;

  if (!codeSnapshot.exists || !referrerUserId) {
    return { applied: false, reason: "invalid_code" };
  }

  if (referrerUserId === referredUserId) {
    return { applied: false, reason: "self" };
  }

  await ensureBillingProfile(referrerUserId, now);

  const referredUserRef = db.collection(USERS_COLLECTION).doc(referredUserId);
  const referrerUserRef = db.collection(USERS_COLLECTION).doc(referrerUserId);
  const keys = getBillingDateKeys(now);
  const ledgerRef = referrerUserRef
    .collection(CREDIT_USAGE_COLLECTION)
    .doc(keys.documentId);

  return db.runTransaction(async (transaction) => {
    const [referredSnapshot, referrerSnapshot, ledgerSnapshot] =
      await Promise.all([
        transaction.get(referredUserRef),
        transaction.get(referrerUserRef),
        transaction.get(ledgerRef),
      ]);

    const referredReferral = normalizeReferral(
      referredSnapshot.data()?.referral,
    );
    const rejection = getReferralRedeemRejection({
      referredUserId,
      referrerUserId,
      alreadyReferredBy: referredReferral.referredBy,
      createdAt:
        typeof referredSnapshot.data()?.createdAt === "string"
          ? referredSnapshot.data()?.createdAt
          : undefined,
      now,
    });
    if (rejection) {
      return { applied: false, reason: rejection };
    }

    const referrerReferral = normalizeReferral(
      referrerSnapshot.data()?.referral,
    );
    const existingBilling = referrerSnapshot.data()?.billing;
    const billing: UserBilling =
      existingBilling && typeof existingBilling === "object"
        ? normalizeBilling(existingBilling, now)
        : createDefaultBilling(now);
    const entryId = `referral_credit_grant_${referredUserId}`;
    const existingUsage = normalizeUsageArray(ledgerSnapshot.data()?.usage);
    const alreadyGranted = hasLedgerEntry(existingUsage, entryId);
    const creditsGranted = alreadyGranted ? 0 : REFERRAL_CREDITS;
    const referredAt = now.toISOString();

    const updatedBilling: UserBilling = {
      ...billing,
      credits: {
        ...billing.credits,
        permanentAvailable:
          billing.credits.permanentAvailable + creditsGranted,
      },
      updatedAt: Timestamp.fromDate(now),
    };

    transaction.set(
      referredUserRef,
      {
        referral: {
          ...referredReferral,
          referredBy: referrerUserId,
          referredAt,
        },
      },
      { merge: true },
    );
    transaction.set(
      referrerUserRef,
      {
        billing: updatedBilling,
        referral: {
          ...referrerReferral,
          successfulReferrals:
            referrerReferral.successfulReferrals + (alreadyGranted ? 0 : 1),
          creditsEarned:
            referrerReferral.creditsEarned + creditsGranted,
        },
      },
      { merge: true },
    );

    if (!alreadyGranted) {
      const entry: CreditGrantEntry = {
        id: entryId,
        type: "referral_credit_grant",
        creditsGranted,
        creditsExpired: 0,
        netCreditChange: creditsGranted,
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

    return { applied: !alreadyGranted };
  });
};
