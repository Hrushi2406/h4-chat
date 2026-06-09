"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal Web Speech API typings. These interfaces are not part of the
 * standard TypeScript DOM lib, so we declare just what we use here.
 */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  // Chrome 138+: force on-device recognition (no audio sent to the cloud).
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

type OnDeviceAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

interface OnDeviceOptions {
  langs: string[];
  processLocally?: boolean;
}

// Static members on the SpeechRecognition constructor for on-device support.
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
  available?(options: OnDeviceOptions): Promise<OnDeviceAvailability>;
  install?(options: OnDeviceOptions): Promise<boolean>;
}

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag. Defaults to the browser language or "en-US". */
  lang?: string;
  /** Keep listening until explicitly stopped. Defaults to true. */
  continuous?: boolean;
  /** Emit results while the user is still speaking. Defaults to true. */
  interimResults?: boolean;
  /** Called with the full transcript for the current session as it updates. */
  onResult?: (transcript: string) => void;
  /** Called when recognition fails. */
  onError?: (error: string) => void;
}

interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  start: () => void;
  stop: () => void;
}

export const useSpeechRecognition = ({
  lang,
  continuous = true,
  interimResults = true,
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn => {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const ctorRef = useRef<SpeechRecognitionConstructor | null>(null);
  const finalTranscriptRef = useRef("");
  // Tracks whether the user still wants to be listening, so a slow on-device
  // model download that finishes after the user released doesn't start late.
  const wantListeningRef = useRef(false);

  // Hold the latest callbacks in refs so the recognition instance does not
  // need to be torn down and rebuilt whenever a callback identity changes.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    ctorRef.current = SpeechRecognition;

    const recognition = new SpeechRecognition();
    // Default to en-US: navigator.language can be a tag the speech service
    // rejects (-> "language-not-supported" on every start).
    recognition.lang = lang ?? "en-US";
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          finalTranscriptRef.current += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const combined = (finalTranscriptRef.current + interimTranscript).trim();
      onResultRef.current?.(combined);
    };

    recognition.onerror = (event) => {
      // "aborted" / "no-speech" are routine when the user releases quickly.
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.error("[speech-recognition] error:", event.error, event.message);
        onErrorRef.current?.(event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang, continuous, interimResults]);

  // Prefer on-device recognition (Chrome 138+) so audio never leaves the
  // device — this also avoids the cloud "network" error in Chrome. Falls back
  // to the default (cloud) engine when on-device isn't available.
  const prepareOnDevice = useCallback(
    async (recognition: SpeechRecognitionInstance) => {
      const Ctor = ctorRef.current;
      if (!Ctor?.available) {
        return; // Older browser: only the cloud engine exists.
      }

      const options: OnDeviceOptions = {
        langs: [recognition.lang],
        processLocally: true,
      };

      try {
        let status = await Ctor.available(options);

        if (status === "downloadable" || status === "downloading") {
          await Ctor.install?.(options);
          status = await Ctor.available(options);
        }

        recognition.processLocally = status === "available";
      } catch {
        recognition.processLocally = false;
      }
    },
    [],
  );

  const start = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (!recognition || isListening) {
      return;
    }

    finalTranscriptRef.current = "";
    wantListeningRef.current = true;
    setIsListening(true);

    await prepareOnDevice(recognition);

    // The user may have released while the on-device model was downloading.
    if (!wantListeningRef.current) {
      setIsListening(false);
      return;
    }

    try {
      recognition.start();
    } catch {
      // start() throws if it is already running; leave the listening state as is.
    }
  }, [isListening, prepareOnDevice]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    recognition.stop();
    setIsListening(false);
  }, []);

  return { isSupported, isListening, start, stop };
};
