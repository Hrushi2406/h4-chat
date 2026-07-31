import { describe, expect, it } from "vitest";

import {
  getPostPurchasePath,
  getPricingHref,
} from "@/lib/billing/pricing-return";

describe("pricing return destinations", () => {
  it("preserves an internal originating route", () => {
    expect(getPostPurchasePath("/chat/thread-123?mode=research")).toBe(
      "/chat/thread-123?mode=research",
    );
  });

  it("falls back to chat for direct, external, and recursive destinations", () => {
    expect(getPostPurchasePath()).toBe("/chat");
    expect(getPostPurchasePath("https://example.com")).toBe("/chat");
    expect(getPostPurchasePath("//example.com")).toBe("/chat");
    expect(getPostPurchasePath("/pricing")).toBe("/chat");
  });

  it("adds the originating route before the pricing hash", () => {
    expect(getPricingHref("/chat/thread-123", "recharge")).toBe(
      "/pricing?returnTo=%2Fchat%2Fthread-123#recharge",
    );
  });
});
