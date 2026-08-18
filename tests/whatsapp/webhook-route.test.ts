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
      phoneNumberId: "phone",
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
      phoneNumberId: "phone",
      store: { acceptInbound, recordStatus: vi.fn() },
      schedule: vi.fn(),
      process: vi.fn(),
    });
    const response = await handlers.POST(signedRequest({}, "sha256=bad"));
    expect(response.status).toBe(401);
    expect(acceptInbound).not.toHaveBeenCalled();
  });

  it("starts the typing indicator before inbound persistence finishes", async () => {
    let releaseAcceptance: ((accepted: boolean) => void) | undefined;
    const acceptInbound = vi.fn().mockImplementation(
      () => new Promise<boolean>((resolve) => {
        releaseAcceptance = resolve;
      }),
    );
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      phoneNumberId: "phone",
      store: { acceptInbound, recordStatus: vi.fn() },
      schedule: vi.fn(),
      acknowledge,
      process: vi.fn(),
    });
    const message = {
      id: "wamid.typing",
      from: "919999999999",
      timestamp: "1700000000",
      type: "text",
      text: { body: "Hi" },
    };
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "phone" },
        messages: [message],
      } }] }],
    };

    const responsePromise = handlers.POST(signedRequest(payload));
    await vi.waitFor(() => expect(acceptInbound).toHaveBeenCalledTimes(1));
    const typingStartedBeforePersistence = acknowledge.mock.calls.length === 1;
    releaseAcceptance?.(true);
    await responsePromise;

    expect(typingStartedBeforePersistence).toBe(true);
  });

  it("does not await the typing indicator request", async () => {
    const acknowledge = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      phoneNumberId: "phone",
      store: {
        acceptInbound: vi.fn().mockResolvedValue(false),
        recordStatus: vi.fn(),
      },
      schedule: vi.fn(),
      acknowledge,
      process: vi.fn(),
    });
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "phone" },
        messages: [{
          id: "wamid.fire-and-forget",
          from: "919999999999",
          timestamp: "1700000000",
          type: "text",
          text: { body: "Hi" },
        }],
      } }] }],
    };

    const response = await handlers.POST(signedRequest(payload));

    expect(response.status).toBe(200);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith("wamid.fire-and-forget");
  });

  it("forwards work claimed during webhook acceptance", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    let scheduled: (() => Promise<void>) | undefined;
    const message = {
      id: "wamid.preclaimed",
      from: "919999999999",
      phoneNumberId: "phone",
      timestamp: new Date("2026-08-17T10:00:00.000Z"),
      type: "text" as const,
      originalType: "text",
      text: "Hi",
    };
    const account = {
      phoneNumber: message.from,
      userId: "user-1",
      consent: "accepted" as const,
      optedOut: false,
      blocked: false,
      modelId: "deepseek/deepseek-v4-flash",
      pendingMessageIds: [],
      requiresWebLink: false,
      welcomeCreditsGranted: true,
    };
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      phoneNumberId: "phone",
      store: {
        acceptInbound: vi.fn().mockResolvedValue({
          accepted: true,
          work: { message, account },
        }),
        recordStatus: vi.fn(),
      },
      schedule: (callback) => { scheduled = callback as () => Promise<void>; },
      acknowledge: vi.fn().mockResolvedValue(undefined),
      process,
    });
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "phone" },
        messages: [{
          id: message.id,
          from: message.from,
          timestamp: "1700000000",
          type: "text",
          text: { body: "Hi" },
        }],
      } }] }],
    };

    await handlers.POST(signedRequest(payload));
    await scheduled?.();

    expect(process).toHaveBeenCalledExactlyOnceWith(message.id, { message, account });
  });

  it("persists once and schedules accepted messages after returning", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const acknowledge = vi.fn().mockResolvedValue(undefined);
    let scheduled: (() => Promise<void>) | undefined;
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      phoneNumberId: "phone",
      store: {
        acceptInbound: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
        recordStatus: vi.fn(),
      },
      schedule: (callback) => { scheduled = callback as () => Promise<void>; },
      acknowledge,
      process,
    });
    const message = { id: "wamid.1", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "Hi" } };
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone" }, messages: [message, { ...message, id: "wamid.duplicate" }] } }] }] };
    const response = await handlers.POST(signedRequest(payload));
    expect(response.status).toBe(200);
    expect(acknowledge).toHaveBeenCalledWith("wamid.1");
    expect(acknowledge).toHaveBeenCalledWith("wamid.duplicate");
    expect(process).not.toHaveBeenCalled();
    await scheduled?.();
    expect(process).toHaveBeenCalledExactlyOnceWith("wamid.1");
  });

  it("ignores messages addressed to another number in the WABA", async () => {
    const acceptInbound = vi.fn();
    const handlers = createWhatsAppWebhookHandlers({
      verifyToken: "token",
      appSecret,
      phoneNumberId: "sakhi-phone",
      store: { acceptInbound, recordStatus: vi.fn() },
      schedule: vi.fn(),
      process: vi.fn(),
    });
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "another-phone" },
        messages: [{ id: "wamid.other", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "Hi" } }],
      } }] }],
    };

    const response = await handlers.POST(signedRequest(payload));

    expect(response.status).toBe(200);
    expect(acceptInbound).not.toHaveBeenCalled();
  });
});
