import { describe, expect, it } from "vitest";
import {
  shouldStartNewThread,
  shouldNotifyAutomationOnWhatsApp,
  normalizeWhatsAppCommand,
  isRetryableMetaFailure,
  shouldApplyDeliveryStatus,
} from "@/lib/whatsapp/policy";
import { getOggOpusDurationSeconds } from "@/lib/whatsapp/transcription";

describe("WhatsApp policy", () => {
  it("rolls a conversation after four hours, not at the boundary", () => {
    const last = new Date("2026-08-17T00:00:00.000Z");
    expect(shouldStartNewThread(last, new Date("2026-08-17T04:00:00.000Z"))).toBe(false);
    expect(shouldStartNewThread(last, new Date("2026-08-17T04:00:00.001Z"))).toBe(true);
  });

  it("normalizes channel commands without treating normal text as a command", () => {
    expect(normalizeWhatsAppCommand("  /NEW  ")).toBe("new");
    expect(normalizeWhatsAppCommand("STOP")).toBe("stop");
    expect(normalizeWhatsAppCommand("new")).toBeUndefined();
    expect(normalizeWhatsAppCommand("continue")).toBeUndefined();
    expect(normalizeWhatsAppCommand("continue", "interactive")).toBe("continue");
    expect(normalizeWhatsAppCommand("please stop now")).toBeUndefined();
  });

  it("notifies automation runs only when opted in and inside 24 hours", () => {
    const last = new Date("2026-08-16T12:00:00.000Z");
    expect(shouldNotifyAutomationOnWhatsApp(true, last, new Date("2026-08-17T12:00:00.000Z"))).toBe(true);
    expect(shouldNotifyAutomationOnWhatsApp(true, last, new Date("2026-08-17T12:00:00.001Z"))).toBe(false);
    expect(shouldNotifyAutomationOnWhatsApp(false, last, new Date("2026-08-16T12:01:00.000Z"))).toBe(false);
  });

  it("reads the final Ogg Opus granule to enforce the four-minute voice limit", () => {
    const bytes = new ArrayBuffer(64);
    const view = new DataView(bytes);
    for (const [index, value] of [0x4f, 0x67, 0x67, 0x53].entries()) {
      view.setUint8(20 + index, value);
    }
    view.setBigUint64(26, BigInt(48_000 * 241), true);
    expect(getOggOpusDurationSeconds(bytes)).toBe(241);
  });

  it("does not regress delivery state when Meta callbacks arrive out of order", () => {
    const readAt = new Date("2026-08-17T10:01:00.000Z");
    expect(shouldApplyDeliveryStatus(
      { status: "read", timestamp: readAt },
      { status: "delivered", timestamp: new Date("2026-08-17T10:00:30.000Z") },
    )).toBe(false);
    expect(shouldApplyDeliveryStatus(
      { status: "sent", timestamp: readAt },
      { status: "delivered", timestamp: new Date("2026-08-17T10:01:01.000Z") },
    )).toBe(true);
    expect(isRetryableMetaFailure([{ code: 130429 }])).toBe(true);
    expect(isRetryableMetaFailure([{ code: 131026 }])).toBe(false);
  });

});
