const MAX_VOICE_BYTES = 25 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 4 * 60;

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
  filename = "voice-note.ogg",
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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const form = new FormData();
  form.set("model", "gpt-4o-transcribe");
  form.set("response_format", "json");
  form.set("file", new Blob([bytes], { type: mimeType }), filename);
  const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`Voice transcription failed (${response.status})`);
  }
  const data = (await response.json()) as {
    text?: string;
    language?: string;
    duration?: number;
  };
  if (!data.text?.trim()) throw new Error("Voice transcription returned no text");
  if (data.duration && data.duration > MAX_VOICE_SECONDS) {
    throw new Error("Voice note is longer than four minutes.");
  }
  return {
    text: data.text.trim(),
    language: data.language,
    durationSeconds: data.duration,
  };
};
