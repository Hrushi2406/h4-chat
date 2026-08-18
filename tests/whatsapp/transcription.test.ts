import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeVoiceNote } from "@/lib/whatsapp/transcription";

const originalKey = process.env.AI_GATEWAY_API_KEY;

describe("transcribeVoiceNote", () => {
  afterEach(() => {
    process.env.AI_GATEWAY_API_KEY = originalKey;
  });

  it("posts base64 audio to the Gateway's REST transcription endpoint with the model header", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: "Remind me to call mom", language: "en", durationInSeconds: 3.2 }),
      { status: 200 },
    ));
    const bytes = new TextEncoder().encode("fake audio bytes").buffer;

    const result = await transcribeVoiceNote(bytes, "audio/ogg", fetchImpl);

    expect(result).toEqual({ text: "Remind me to call mom", language: "en", durationSeconds: 3.2 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ai-gateway.vercel.sh/v4/ai/transcription-model",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-gateway-key",
          "ai-model-id": "openai/gpt-4o-transcribe",
          "ai-gateway-protocol-version": "0.0.1",
        }),
      }),
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      audio: Buffer.from(bytes).toString("base64"),
      mediaType: "audio/ogg",
    });
  });

  it("throws when AI_GATEWAY_API_KEY is not configured", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const fetchImpl = vi.fn();

    await expect(transcribeVoiceNote(new ArrayBuffer(4), "audio/ogg", fetchImpl))
      .rejects.toThrow("AI_GATEWAY_API_KEY is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when the Gateway responds with a failure status", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 502 }));

    await expect(transcribeVoiceNote(new ArrayBuffer(4), "audio/ogg", fetchImpl))
      .rejects.toThrow("Voice transcription failed (502)");
  });

  it("throws when the transcript comes back empty", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: "  " }),
      { status: 200 },
    ));

    await expect(transcribeVoiceNote(new ArrayBuffer(4), "audio/ogg", fetchImpl))
      .rejects.toThrow("Voice transcription returned no text");
  });

  it("rejects a voice note longer than four minutes before calling the Gateway", async () => {
    const fetchImpl = vi.fn();
    // Minimal Ogg page trailer: "OggS" capture pattern followed by a granule
    // position encoding a duration past the four-minute limit.
    const bytes = new ArrayBuffer(32);
    const view = new DataView(bytes);
    view.setUint8(0, 0x4f);
    view.setUint8(1, 0x67);
    view.setUint8(2, 0x67);
    view.setUint8(3, 0x53);
    view.setBigUint64(6, BigInt(5 * 60 * 48_000), true);

    await expect(transcribeVoiceNote(bytes, "audio/ogg", fetchImpl))
      .rejects.toThrow("Voice note is longer than four minutes.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
