import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";

describe("verifyMetaSignature", () => {
  it("accepts the exact raw body signed with the app secret", () => {
    const body = '{"entry":[{"id":"one"}]}';
    const secret = "app-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyMetaSignature(body, signature, secret)).toBe(true);
  });

  it("rejects missing, malformed, and mismatched signatures", () => {
    expect(verifyMetaSignature("body", null, "secret")).toBe(false);
    expect(verifyMetaSignature("body", "sha1=bad", "secret")).toBe(false);
    expect(verifyMetaSignature("body", "sha256=bad", "secret")).toBe(false);
  });
});
