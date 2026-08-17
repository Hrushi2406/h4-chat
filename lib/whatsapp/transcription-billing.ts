import "server-only";

import { CREDIT_FORMULA_VERSION, MODEL_RATE_VERSION } from "@/lib/billing/config";
import { deductCredits } from "@/lib/billing/server";

export const chargeWhatsAppTranscription = async (
  userId: string,
  messageId: string,
) => deductCredits({
  userId,
  idempotencyKey: `whatsapp:${messageId}:transcription`,
  calculation: {
    credits: 1,
    modelCostNanoUsd: 0,
    toolCostNanoUsd: 0,
    totalCostNanoUsd: 0,
    creditMultiplier: 1,
    formulaVersion: CREDIT_FORMULA_VERSION,
    rateVersion: MODEL_RATE_VERSION,
  },
});
