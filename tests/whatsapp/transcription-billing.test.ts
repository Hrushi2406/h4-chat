import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deductCredits: vi.fn().mockResolvedValue({
    deductedCredits: 1,
    consumedCredits: 1,
  }),
}));

vi.mock("@/lib/billing/server", () => mocks);

import { chargeWhatsAppTranscription } from "@/lib/whatsapp/transcription-billing";

describe("WhatsApp transcription billing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the shared idempotent billing deduction path", async () => {
    await chargeWhatsAppTranscription("user-1", "wamid.audio");

    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      idempotencyKey: "whatsapp:wamid.audio:transcription",
      calculation: expect.objectContaining({ credits: 1 }),
    }));
  });
});
