import { describe, expect, it } from "vitest";

import { normalizeWhatsAppFormatting } from "@/lib/whatsapp/format";

describe("normalizeWhatsAppFormatting", () => {
  it("collapses a link whose label repeats the URL", () => {
    const input =
      "[https://connect.composio.dev/link/lk_0xmZ2Amxa16o](https://connect.composio.dev/link/lk_0xmZ2Amxa16o)";
    expect(normalizeWhatsAppFormatting(input)).toBe(
      "https://connect.composio.dev/link/lk_0xmZ2Amxa16o",
    );
  });

  it("collapses a label that matches the URL apart from the protocol", () => {
    const input = "[connect.composio.dev/link/abc](https://connect.composio.dev/link/abc)";
    expect(normalizeWhatsAppFormatting(input)).toBe("https://connect.composio.dev/link/abc");
  });

  it("keeps a meaningful label but drops the Markdown syntax", () => {
    expect(normalizeWhatsAppFormatting("[Connect Gmail](https://example.com/auth)")).toBe(
      "Connect Gmail: https://example.com/auth",
    );
  });

  it("unwraps an empty label to the bare URL", () => {
    expect(normalizeWhatsAppFormatting("[](https://example.com/x)")).toBe(
      "https://example.com/x",
    );
  });

  it("handles a link embedded in a sentence and mailto targets", () => {
    expect(
      normalizeWhatsAppFormatting("Tap [here](https://example.com/go) to finish"),
    ).toBe("Tap here: https://example.com/go to finish");
    expect(normalizeWhatsAppFormatting("[mail](mailto:hi@example.com)")).toBe(
      "mail: mailto:hi@example.com",
    );
  });

  it("leaves bare URLs and non-link brackets untouched", () => {
    expect(normalizeWhatsAppFormatting("https://example.com/x")).toBe("https://example.com/x");
    expect(normalizeWhatsAppFormatting("[not a link] (just text)")).toBe(
      "[not a link] (just text)",
    );
  });

  it("still applies the existing heading and bold rules", () => {
    expect(normalizeWhatsAppFormatting("## Title\n**bold**")).toBe("Title\n*bold*");
  });
});
