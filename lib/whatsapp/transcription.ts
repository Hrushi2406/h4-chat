const MAX_VOICE_BYTES = 25 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 4 * 60;
const TRANSCRIPTION_MODEL_ID = "openai/gpt-4o-transcribe";

export interface VoiceTranscript {
  text: string;
  language?: string;
  durationSeconds?: number;
}

export const getOggOpusDurationSeconds = (bytes: ArrayBuffer): number | undefined => {
  const view = new DataView(bytes);
  for (let offset = view.byteLength - 27; offset >= 0; offset -= 1) {
    if (
      view.getUint8(offset) === 0x4f &&
      view.getUint8(offset + 1) === 0x67 &&
      view.getUint8(offset + 2) === 0x67 &&
      view.getUint8(offset + 3) === 0x53
    ) {
      const granule = view.getBigUint64(offset + 6, true);
      const seconds = Number(granule) / 48_000;
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
    }
  }
  return undefined;
};

export const transcribeVoiceNote = async (
  bytes: ArrayBuffer,
  mimeType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VoiceTranscript> => {
  if (bytes.byteLength > MAX_VOICE_BYTES) {
    throw new Error("Voice note is too large. Please send a note under four minutes.");
  }
  if (mimeType.includes("ogg") || mimeType.includes("opus")) {
    const duration = getOggOpusDurationSeconds(bytes);
    if (duration !== undefined && duration > MAX_VOICE_SECONDS) {
      throw new Error("Voice note is longer than four minutes.");
    }
  }
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not configured");

  // The AI SDK's transcribe() only routes through the Gateway on ai@7.0.31+ /
  // @ai-sdk/gateway@4.0.23+; this app is pinned to ai@6, so bumping would touch every
  // AI call in the codebase just to fix voice notes. The Gateway's plain REST
  // transcription endpoint needs neither package and uses the same AI_GATEWAY_API_KEY
  // already configured everywhere else.
  const response = await fetchImpl("https://ai-gateway.vercel.sh/v4/ai/transcription-model", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "ai-model-id": TRANSCRIPTION_MODEL_ID,
      "ai-gateway-protocol-version": "0.0.1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio: Buffer.from(bytes).toString("base64"),
      mediaType: mimeType,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`Voice transcription failed (${response.status})`);
  }
  const data = (await response.json()) as {
    text?: string;
    language?: string;
    durationInSeconds?: number;
  };
  if (!data.text?.trim()) throw new Error("Voice transcription returned no text");
  if (data.durationInSeconds && data.durationInSeconds > MAX_VOICE_SECONDS) {
    throw new Error("Voice note is longer than four minutes.");
  }
  return {
    text: data.text.trim(),
    language: data.language,
    durationSeconds: data.durationInSeconds,
  };
};
