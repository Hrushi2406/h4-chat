import { describe, expect, it } from "vitest";
import { parseMetaWebhook } from "@/lib/whatsapp/payload";

describe("parseMetaWebhook", () => {
  it("extracts inbound messages and delivery statuses", () => {
    const result = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{
        id: "waba",
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-id" },
            contacts: [{ wa_id: "919999999999", profile: { name: "Asha" } }],
            messages: [{
              id: "wamid.inbound",
              from: "919999999999",
              timestamp: "1700000000",
              type: "text",
              text: { body: "Hello Sakhi" },
            }],
            statuses: [{
              id: "wamid.outbound",
              status: "delivered",
              timestamp: "1700000001",
              recipient_id: "919999999999",
            }],
          },
        }],
      }],
    });

    expect(result.messages).toEqual([expect.objectContaining({
      id: "wamid.inbound",
      from: "919999999999",
      phoneNumberId: "phone-id",
      profileName: "Asha",
      type: "text",
      text: "Hello Sakhi",
    })]);
    expect(result.statuses).toEqual([expect.objectContaining({
      messageId: "wamid.outbound",
      status: "delivered",
    })]);
  });

  it("keeps media metadata and classifies unsupported payloads", () => {
    const result = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "phone-id" },
        messages: [
          { id: "voice", from: "1", timestamp: "1", type: "audio", audio: { id: "media-1", mime_type: "audio/ogg", voice: true } },
          { id: "video", from: "1", timestamp: "2", type: "video", video: { id: "media-2" } },
        ],
      } }] }],
    });

    expect(result.messages[0]).toEqual(expect.objectContaining({
      type: "audio",
      media: expect.objectContaining({ id: "media-1", isVoice: true }),
    }));
    expect(result.messages[1]).toEqual(expect.objectContaining({ type: "unsupported", originalType: "video" }));
  });
});
