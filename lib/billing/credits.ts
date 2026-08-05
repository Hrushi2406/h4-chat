import {
  CREDIT_FORMULA_VERSION,
  CREDIT_MULTIPLIER,
  MODEL_RATE_VERSION,
  METERED_TOOL_COSTS_NANO_USD,
  getModelRate,
} from "@/lib/billing/config";

const ZERO = BigInt(0);
const PICO_USD_PER_NANO_USD = BigInt(1_000);
const PICO_USD_PER_CREDIT_AT_MULTIPLIER_ONE = BigInt(1_000_000_000);
const MULTIPLIER_SCALE = BigInt(1_000);

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type BillableModelUsage = TokenUsage & {
  modelId: string;
};

export type CreditCalculationInput = {
  models: readonly BillableModelUsage[];
  toolCostNanoUsd?: number;
  creditMultiplier?: number;
};

export type CreditCalculation = {
  credits: number;
  modelCostNanoUsd: number;
  toolCostNanoUsd: number;
  totalCostNanoUsd: number;
  creditMultiplier: number;
  formulaVersion: number;
  rateVersion: number;
};

export class MissingModelRateError extends Error {
  constructor(readonly modelId: string) {
    super(`Billing rate is not configured for model ${modelId}`);
    this.name = "MissingModelRateError";
  }
}

const safeTokenCount = (value: number | undefined) =>
  Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 0;

const ceilDivide = (numerator: bigint, denominator: bigint) =>
  numerator === ZERO
    ? ZERO
    : (numerator + denominator - BigInt(1)) / denominator;

export const calculateModelCostPicoUsd = (usage: BillableModelUsage) => {
  const modelRate = getModelRate(usage.modelId);
  if (!modelRate) throw new MissingModelRateError(usage.modelId);

  const totalInput = safeTokenCount(usage.inputTokens);
  const cacheRead = safeTokenCount(usage.cacheReadTokens);
  const cacheWrite = safeTokenCount(usage.cacheWriteTokens);
  const explicitNoCache = safeTokenCount(usage.noCacheTokens);
  const noCache =
    explicitNoCache > 0
      ? explicitNoCache
      : Math.max(0, totalInput - cacheRead - cacheWrite);
  const output = safeTokenCount(usage.outputTokens);
  const tier =
    [...modelRate.tiers]
      .reverse()
      .find((candidate) => totalInput >= candidate.minInputTokens) ??
    modelRate.tiers[0];

  const regularInputCost =
    BigInt(noCache) * BigInt(tier.inputPicoUsdPerToken);
  const cacheReadCost =
    BigInt(cacheRead) *
    BigInt(tier.cacheReadPicoUsdPerToken ?? tier.inputPicoUsdPerToken);
  const cacheWriteCost =
    BigInt(cacheWrite) *
    BigInt(tier.cacheWritePicoUsdPerToken ?? tier.inputPicoUsdPerToken);
  const outputCost =
    BigInt(output) * BigInt(tier.outputPicoUsdPerToken);

  return regularInputCost + cacheReadCost + cacheWriteCost + outputCost;
};

export const calculateCredits = (
  input: CreditCalculationInput,
): CreditCalculation => {
  const modelCostPicoUsd = input.models.reduce(
    (total, usage) => total + calculateModelCostPicoUsd(usage),
    ZERO,
  );
  const toolCostNanoUsd = Math.max(
    0,
    Math.ceil(input.toolCostNanoUsd ?? 0),
  );
  const toolCostPicoUsd = BigInt(toolCostNanoUsd) * PICO_USD_PER_NANO_USD;
  const totalCostPicoUsd = modelCostPicoUsd + toolCostPicoUsd;
  const creditMultiplier = input.creditMultiplier ?? CREDIT_MULTIPLIER;
  const multiplierScaled = BigInt(Math.round(creditMultiplier * 1_000));
  const calculatedCredits = ceilDivide(
    totalCostPicoUsd * multiplierScaled,
    PICO_USD_PER_CREDIT_AT_MULTIPLIER_ONE * MULTIPLIER_SCALE,
  );

  return {
    credits: Number(
      calculatedCredits > ZERO ? calculatedCredits : BigInt(1),
    ),
    modelCostNanoUsd: Number(
      ceilDivide(modelCostPicoUsd, PICO_USD_PER_NANO_USD),
    ),
    toolCostNanoUsd,
    totalCostNanoUsd: Number(
      ceilDivide(totalCostPicoUsd, PICO_USD_PER_NANO_USD),
    ),
    creditMultiplier,
    formulaVersion: CREDIT_FORMULA_VERSION,
    rateVersion: MODEL_RATE_VERSION,
  };
};

export const usageFromAiSdk = (
  modelId: string,
  usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        inputTokenDetails?: {
          noCacheTokens?: number;
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
        };
      }
    | undefined,
): BillableModelUsage => ({
  modelId,
  inputTokens: usage?.inputTokens,
  outputTokens: usage?.outputTokens,
  noCacheTokens: usage?.inputTokenDetails?.noCacheTokens,
  cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens,
  cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens,
});

export const calculateMeteredToolCostNanoUsd = (
  toolNames: readonly string[],
) =>
  toolNames.reduce(
    (total, toolName) =>
      total + (METERED_TOOL_COSTS_NANO_USD[toolName] ?? 0),
    0,
  );
