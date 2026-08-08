import type { AIModel } from "@/lib/available-models";

export const BILLING_TIMEZONE = "Asia/Kolkata";
export const CREDIT_FORMULA_VERSION = 1;
export const MODEL_RATE_VERSION = 1;
export const CREDIT_MULTIPLIER = 2;
export const FREE_CREDIT_MULTIPLIER = 7;
export const WELCOME_CREDITS = 1_000;

export const CREDIT_RECHARGE = {
  creditsPerUnit: 1_000,
  pricePaisePerUnit: 9_900,
  minimumUnits: 1,
  maximumUnits: 100,
  defaultUnits: 1,
} as const;

export const getRechargeCredits = (units: number) =>
  units * CREDIT_RECHARGE.creditsPerUnit;

export const getRechargePricePaise = (credits: number) =>
  (credits / CREDIT_RECHARGE.creditsPerUnit) *
  CREDIT_RECHARGE.pricePaisePerUnit;

export const isValidRechargeCredits = (credits: unknown): credits is number =>
  typeof credits === "number" &&
  Number.isInteger(credits) &&
  credits >=
    CREDIT_RECHARGE.minimumUnits * CREDIT_RECHARGE.creditsPerUnit &&
  credits <=
    CREDIT_RECHARGE.maximumUnits * CREDIT_RECHARGE.creditsPerUnit &&
  credits % CREDIT_RECHARGE.creditsPerUnit === 0;

export const getRechargeCreditsToRevoke = ({
  credits,
  amountPaise,
  refundedPaise,
}: {
  credits: number;
  amountPaise: number;
  refundedPaise: number;
}) => {
  if (credits <= 0 || amountPaise <= 0 || refundedPaise <= 0) return 0;
  return Math.min(
    credits,
    Math.ceil((credits * Math.min(refundedPaise, amountPaise)) / amountPaise),
  );
};

export type BillingPlanId =
  | "free"
  | "plus_monthly"
  | "plus_annual"
  | "pro_monthly"
  | "pro_annual";

type PaidBillingPlanId = Exclude<BillingPlanId, "free">;

export type BillingPlan = {
  id: BillingPlanId;
  name: "Free" | "Plus" | "Pro";
  interval: "none" | "monthly" | "annual";
  pricePaise: number;
  monthlyCredits: number;
  creditMultiplier: number;
  connectionLimit: number | null;
  automationLimit: number;
  allowParallelTasks: boolean;
  allowedModels: "all" | readonly string[];
  razorpayPlanEnv?: string;
  razorpayTotalCount?: number;
};

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  free: {
    id: "free",
    name: "Free",
    interval: "none",
    pricePaise: 0,
    monthlyCredits: WELCOME_CREDITS,
    creditMultiplier: FREE_CREDIT_MULTIPLIER,
    connectionLimit: 5,
    automationLimit: 1,
    allowParallelTasks: false,
    allowedModels: ["deepseek/deepseek-v4-flash"],
  },
  plus_monthly: {
    id: "plus_monthly",
    name: "Plus",
    interval: "monthly",
    pricePaise: 39_900,
    monthlyCredits: 10_000,
    creditMultiplier: CREDIT_MULTIPLIER,
    connectionLimit: null,
    automationLimit: 10,
    allowParallelTasks: false,
    allowedModels: "all",
    razorpayPlanEnv: "RAZORPAY_PLUS_MONTHLY_PLAN_ID",
    razorpayTotalCount: 1_200,
  },
  plus_annual: {
    id: "plus_annual",
    name: "Plus",
    interval: "annual",
    pricePaise: 399_000,
    monthlyCredits: 10_000,
    creditMultiplier: CREDIT_MULTIPLIER,
    connectionLimit: null,
    automationLimit: 10,
    allowParallelTasks: false,
    allowedModels: "all",
    razorpayPlanEnv: "RAZORPAY_PLUS_ANNUAL_PLAN_ID",
    razorpayTotalCount: 100,
  },
  pro_monthly: {
    id: "pro_monthly",
    name: "Pro",
    interval: "monthly",
    pricePaise: 199_900,
    monthlyCredits: 50_000,
    creditMultiplier: CREDIT_MULTIPLIER,
    connectionLimit: null,
    automationLimit: 50,
    allowParallelTasks: true,
    allowedModels: "all",
    razorpayPlanEnv: "RAZORPAY_PRO_MONTHLY_PLAN_ID",
    razorpayTotalCount: 1_200,
  },
  pro_annual: {
    id: "pro_annual",
    name: "Pro",
    interval: "annual",
    pricePaise: 1_999_000,
    monthlyCredits: 50_000,
    creditMultiplier: CREDIT_MULTIPLIER,
    connectionLimit: null,
    automationLimit: 50,
    allowParallelTasks: true,
    allowedModels: "all",
    razorpayPlanEnv: "RAZORPAY_PRO_ANNUAL_PLAN_ID",
    razorpayTotalCount: 100,
  },
};

export const PAID_PLAN_IDS = Object.keys(BILLING_PLANS).filter(
  (planId): planId is PaidBillingPlanId => planId !== "free",
);

export const isBillingPlanId = (value: unknown): value is BillingPlanId =>
  typeof value === "string" && value in BILLING_PLANS;

export const isPaidPlanId = (value: unknown): value is PaidBillingPlanId =>
  isBillingPlanId(value) && value !== "free";

export const isModelAllowedForPlan = (
  planId: BillingPlanId,
  model: AIModel,
) => {
  const allowed = BILLING_PLANS[planId].allowedModels;
  return allowed === "all" || allowed.includes(model.id);
};

export type ModelRateTier = {
  minInputTokens: number;
  inputPicoUsdPerToken: number;
  outputPicoUsdPerToken: number;
  cacheReadPicoUsdPerToken?: number;
  cacheWritePicoUsdPerToken?: number;
};

export type ModelRate = {
  modelId: string;
  tiers: readonly ModelRateTier[];
};

const rate = (
  modelId: string,
  values: Omit<ModelRateTier, "minInputTokens">,
  highContext?: ModelRateTier,
): ModelRate => ({
  modelId,
  tiers: [
    { minInputTokens: 0, ...values },
    ...(highContext ? [highContext] : []),
  ],
});

// Values are integer picoUSD per token. They mirror the AI Gateway catalog
// reviewed for MODEL_RATE_VERSION and must be versioned when prices change.
export const MODEL_RATES: Record<string, ModelRate> = {
  "deepseek/deepseek-v4-flash": rate("deepseek/deepseek-v4-flash", {
    inputPicoUsdPerToken: 140_000,
    outputPicoUsdPerToken: 280_000,
    cacheReadPicoUsdPerToken: 28_000,
  }),
  "deepseek/deepseek-v4-pro": rate("deepseek/deepseek-v4-pro", {
    inputPicoUsdPerToken: 435_000,
    outputPicoUsdPerToken: 870_000,
    cacheReadPicoUsdPerToken: 3_600,
  }),
  "openai/gpt-5-nano": rate("openai/gpt-5-nano", {
    inputPicoUsdPerToken: 50_000,
    outputPicoUsdPerToken: 400_000,
    cacheReadPicoUsdPerToken: 5_000,
  }),
  "openai/gpt-5.5": rate(
    "openai/gpt-5.5",
    {
      inputPicoUsdPerToken: 5_000_000,
      outputPicoUsdPerToken: 30_000_000,
      cacheReadPicoUsdPerToken: 500_000,
    },
    {
      minInputTokens: 272_000,
      inputPicoUsdPerToken: 10_000_000,
      outputPicoUsdPerToken: 45_000_000,
      cacheReadPicoUsdPerToken: 1_000_000,
    },
  ),
  "openai/gpt-5.4": rate(
    "openai/gpt-5.4",
    {
      inputPicoUsdPerToken: 2_500_000,
      outputPicoUsdPerToken: 15_000_000,
      cacheReadPicoUsdPerToken: 250_000,
    },
    {
      minInputTokens: 272_000,
      inputPicoUsdPerToken: 5_000_000,
      outputPicoUsdPerToken: 22_500_000,
      cacheReadPicoUsdPerToken: 500_000,
    },
  ),
  "openai/gpt-5.4-mini": rate("openai/gpt-5.4-mini", {
    inputPicoUsdPerToken: 750_000,
    outputPicoUsdPerToken: 4_500_000,
    cacheReadPicoUsdPerToken: 75_000,
  }),
  "openai/gpt-5.4-nano": rate("openai/gpt-5.4-nano", {
    inputPicoUsdPerToken: 200_000,
    outputPicoUsdPerToken: 1_250_000,
    cacheReadPicoUsdPerToken: 20_000,
  }),
  "anthropic/claude-opus-4.7": rate("anthropic/claude-opus-4.7", {
    inputPicoUsdPerToken: 5_000_000,
    outputPicoUsdPerToken: 25_000_000,
    cacheReadPicoUsdPerToken: 500_000,
    cacheWritePicoUsdPerToken: 6_250_000,
  }),
  "anthropic/claude-sonnet-4.6": rate("anthropic/claude-sonnet-4.6", {
    inputPicoUsdPerToken: 3_000_000,
    outputPicoUsdPerToken: 15_000_000,
    cacheReadPicoUsdPerToken: 300_000,
    cacheWritePicoUsdPerToken: 3_750_000,
  }),
  "anthropic/claude-haiku-4.5": rate("anthropic/claude-haiku-4.5", {
    inputPicoUsdPerToken: 1_000_000,
    outputPicoUsdPerToken: 5_000_000,
    cacheReadPicoUsdPerToken: 100_000,
    cacheWritePicoUsdPerToken: 1_250_000,
  }),
  "google/gemini-3.1-pro-preview": rate(
    "google/gemini-3.1-pro-preview",
    {
      inputPicoUsdPerToken: 2_000_000,
      outputPicoUsdPerToken: 12_000_000,
      cacheReadPicoUsdPerToken: 200_000,
    },
    {
      minInputTokens: 200_001,
      inputPicoUsdPerToken: 4_000_000,
      outputPicoUsdPerToken: 18_000_000,
      cacheReadPicoUsdPerToken: 400_000,
    },
  ),
  "google/gemini-3-flash": rate("google/gemini-3-flash", {
    inputPicoUsdPerToken: 500_000,
    outputPicoUsdPerToken: 3_000_000,
    cacheReadPicoUsdPerToken: 50_000,
  }),
  "google/gemma-4-31b-it": rate("google/gemma-4-31b-it", {
    inputPicoUsdPerToken: 140_000,
    outputPicoUsdPerToken: 400_000,
  }),
  "moonshotai/kimi-k2.6": rate("moonshotai/kimi-k2.6", {
    inputPicoUsdPerToken: 950_000,
    outputPicoUsdPerToken: 4_000_000,
    cacheReadPicoUsdPerToken: 160_000,
  }),
  "minimax/minimax-m2.7": rate("minimax/minimax-m2.7", {
    inputPicoUsdPerToken: 300_000,
    outputPicoUsdPerToken: 1_200_000,
    cacheReadPicoUsdPerToken: 60_000,
    cacheWritePicoUsdPerToken: 375_000,
  }),
  "xai/grok-4.3": rate(
    "xai/grok-4.3",
    {
      inputPicoUsdPerToken: 1_250_000,
      outputPicoUsdPerToken: 2_500_000,
      cacheReadPicoUsdPerToken: 200_000,
    },
    {
      minInputTokens: 200_001,
      inputPicoUsdPerToken: 2_500_000,
      outputPicoUsdPerToken: 5_000_000,
      cacheReadPicoUsdPerToken: 400_000,
    },
  ),
  "xai/grok-4.20-reasoning": rate(
    "xai/grok-4.20-reasoning",
    {
      inputPicoUsdPerToken: 1_250_000,
      outputPicoUsdPerToken: 2_500_000,
      cacheReadPicoUsdPerToken: 200_000,
    },
    {
      minInputTokens: 200_001,
      inputPicoUsdPerToken: 2_500_000,
      outputPicoUsdPerToken: 5_000_000,
      cacheReadPicoUsdPerToken: 400_000,
    },
  ),
};

export const getModelRate = (modelId: string) => MODEL_RATES[modelId];

// Add only real vendor charges here, in nanoUSD per successful tool call.
// Keep this separate from CREDIT_MULTIPLIER so provider cost and pricing policy
// remain auditable.
export const METERED_TOOL_COSTS_NANO_USD: Readonly<Record<string, number>> = {};
