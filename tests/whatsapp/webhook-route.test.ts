import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createWhatsAppWebhookHandlers } from "@/lib/whatsapp/webhook";

const appSecret = "test-secret";
const signedRequest = (payload: unknown, signatureOverride?: string) => {
  const body = JSON.stringify(payload);
  const signature = signatureOverride ?? `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  return new Request("http://localhost/api/whatsapp/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": signature },
    body,
  });
};

describe("WhatsApp webhook route", () => {
  it("answers a valid Meta challenge", async () => {
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "verify-me",
      appSecret,
      store: { acceptInbound: vi.fn(), recordStatus: vi.fn() },
      schedule: vi.fn(),
      process: vi.fn(),
    });
    const response = await handlers.GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"));
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("12345");
  });

  it("rejects an invalid signature before persistence", async () => {
    const acceptInbound = vi.fn();
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      store: { acceptInbound, recordStatus: vi.fn() },
      schedule: vi.fn(),
      process: vi.fn(),
    });
    const response = await handlers.POST(signedRequest({}, "sha256=bad"));
    expect(response.status).toBe(401);
    expect(acceptInbound).not.toHaveBeenCalled();
  });

  it("persists once and schedules accepted messages after returning", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    let scheduled: (() => Promise<void>) | undefined;
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      store: {
        acceptInbound: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
        recordStatus: vi.fn(),
      },
      schedule: (callback) => { scheduled = callback as () => Promise<void>; },
      process,
    });
    const message = { id: "wamid.1", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "Hi" } };
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone" }, messages: [message, { ...message, id: "wamid.duplicate" }] } }] }] };
    const response = await handlers.POST(signedRequest(payload));
    expect(response.status).toBe(200);
    expect(process).not.toHaveBeenCalled();
    await scheduled?.();
    expect(process).toHaveBeenCalledExactlyOnceWith("wamid.1");
  });
});
