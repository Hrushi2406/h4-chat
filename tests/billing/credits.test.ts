import { describe, expect, it } from "vitest";
import {
  calculateCredits,
  calculateModelCostPicoUsd,
} from "@/lib/billing/credits";

describe("credit calculation", () => {
  it("charges exactly 7 credits for the agreed Sakhi 1 example", () => {
    const result = calculateCredits({
      models: [
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 45_125,
          outputTokens: 788,
        },
      ],
    });

    expect(result.modelCostNanoUsd).toBe(6_538_140);
    expect(result.credits).toBe(7);
  });

  it("rounds once after summing every model step", () => {
    const result = calculateCredits({
      models: [
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 3_000,
          outputTokens: 0,
        },
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 3_000,
          outputTokens: 0,
        },
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 3_000,
          outputTokens: 0,
        },
      ],
    });

    // Each step costs $0.00042, but the whole task costs $0.00126.
    expect(result.credits).toBe(2);
  });

  it("uses cached-input rates without double-counting cached tokens", () => {
    const cost = calculateModelCostPicoUsd({
      modelId: "deepseek/deepseek-v4-flash",
      inputTokens: 1_000,
      cacheReadTokens: 400,
      outputTokens: 100,
    });

    // 600 regular × 140,000 + 400 cached × 28,000 + 100 output × 280,000
    expect(cost).toBe(BigInt(123_200_000));
  });

  it("adds actual metered tool cost before rounding", () => {
    const result = calculateCredits({
      models: [
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 1_000,
          outputTokens: 0,
        },
      ],
      toolCostNanoUsd: 1_000_000,
    });

    expect(result.credits).toBe(2);
  });

  it("applies the explicit multiplier after actual cost", () => {
    const result = calculateCredits({
      models: [
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 45_125,
          outputTokens: 788,
        },
      ],
      creditMultiplier: 2,
    });

    expect(result.credits).toBe(14);
  });

  it("charges a minimum of one credit for a successful billable task", () => {
    const result = calculateCredits({
      models: [
        {
          modelId: "deepseek/deepseek-v4-flash",
          inputTokens: 0,
          outputTokens: 0,
        },
      ],
    });

    expect(result.credits).toBe(1);
  });
});
