import { experimental_transcribe as transcribe } from "ai";

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
  // Routed through the Vercel AI Gateway like every other model call in this app
  // (AI_GATEWAY_API_KEY), not a standalone OpenAI key.
  const result = await transcribe({
    model: TRANSCRIPTION_MODEL_ID,
    audio: bytes,
    abortSignal: AbortSignal.timeout(90_000),
  });
  if (!result.text?.trim()) throw new Error("Voice transcription returned no text");
  if (result.durationInSeconds && result.durationInSeconds > MAX_VOICE_SECONDS) {
    throw new Error("Voice note is longer than four minutes.");
  }
  return {
    text: result.text.trim(),
    language: result.language,
    durationSeconds: result.durationInSeconds,
  };
};
