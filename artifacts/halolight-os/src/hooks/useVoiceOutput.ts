import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceOutputState = "idle" | "playing" | "unsupported";

interface UseVoiceOutputOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onEnd?: () => void;
}

export function useVoiceOutput(options: UseVoiceOutputOptions = {}) {
  const [state, setState] = useState<VoiceOutputState>(() =>
    typeof window !== "undefined" && "speechSynthesis" in window
      ? "idle"
      : "unsupported"
  );
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState("idle");
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (text: string, id?: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window))
        return;
      window.speechSynthesis.cancel();

      const cleaned = text
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/#{1,6}\s/g, "")
        .trim();

      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = optionsRef.current.rate ?? 1.0;
      utterance.pitch = optionsRef.current.pitch ?? 1.0;
      utterance.volume = optionsRef.current.volume ?? 1.0;
      utterance.lang = "en-US";

      utterance.onstart = () => {
        setState("playing");
        setSpeakingId(id ?? null);
      };
      utterance.onend = () => {
        setState("idle");
        setSpeakingId(null);
        utteranceRef.current = null;
        optionsRef.current.onEnd?.();
      };
      utterance.onerror = () => {
        setState("idle");
        setSpeakingId(null);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [stop]
  );

  const toggle = useCallback(
    (text: string, id?: string) => {
      if (speakingId === id && state === "playing") {
        stop();
      } else {
        speak(text, id);
      }
    },
    [speakingId, state, stop, speak]
  );

  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  return {
    state,
    speakingId,
    speak,
    stop,
    toggle,
    isSupported: state !== "unsupported",
    isPlaying: state === "playing",
  };
}
