import { useState, useRef, useCallback, useEffect } from "react";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  type ISpeechRecognition,
} from "@/lib/voice/speechTypes";

export type VoiceInputState =
  | "idle"
  | "requesting"
  | "listening"
  | "processing"
  | "error"
  | "unsupported";

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  language?: string;
}

export function useVoiceInput({
  onTranscript,
  onError,
  language = "en-US",
}: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>(() =>
    isSpeechRecognitionSupported() ? "idle" : "unsupported"
  );
  const [partialTranscript, setPartialTranscript] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const abort = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setState("idle");
    setPartialTranscript("");
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setState("unsupported");
      return;
    }

    // Toggle off if already running
    if (recognitionRef.current) {
      abort();
      return;
    }

    setState("requesting");

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("error");
      onErrorRef.current?.(
        "Microphone access denied. Please allow microphone access and try again."
      );
      setTimeout(() => setState("idle"), 3000);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setState("listening");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setPartialTranscript(interim);
      if (final) {
        setPartialTranscript("");
        setState("processing");
        onTranscriptRef.current(final.trim());
        setTimeout(() => setState("idle"), 200);
        recognitionRef.current = null;
      }
    };

    recognition.onerror = (event) => {
      const msg =
        event.error === "not-allowed"
          ? "Microphone access denied."
          : event.error === "no-speech"
          ? "No speech detected. Try again."
          : `Voice error: ${event.error}`;
      setState("error");
      onErrorRef.current?.(msg);
      setTimeout(() => setState("idle"), 3000);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setState((prev) =>
        prev === "listening" || prev === "requesting" ? "idle" : prev
      );
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setPartialTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [language, abort]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return {
    state,
    partialTranscript,
    start,
    stop,
    abort,
    isSupported: state !== "unsupported",
    isListening: state === "listening",
    isActive:
      state === "listening" ||
      state === "requesting" ||
      state === "processing",
  };
}
