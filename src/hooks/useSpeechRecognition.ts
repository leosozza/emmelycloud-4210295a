import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface UseSpeechRecognitionOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

interface UseSpeechRecognitionReturn {
  isAvailable: boolean;
  isListening: boolean;
  transcript: string;
  partialTranscript: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

function getSpeechRecognitionConstructor(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    lang = "pt-PT",
    continuous = true,
    interimResults = true,
    onResult,
    onError,
    onEnd,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const isAvailable = !!getSpeechRecognitionConstructor();

  // Keep callbacks fresh
  const cbRef = useRef({ onResult, onError, onEnd });
  cbRef.current = { onResult, onError, onEnd };

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      cbRef.current.onError?.("SpeechRecognition not supported");
      return;
    }

    // Clean up any existing instance
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    const committed: string[] = [];

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          committed.push(result[0].transcript.trim());
        } else {
          interim += result[0].transcript;
        }
      }
      setPartialTranscript(interim);
      const full = committed.join(" ");
      if (full) setTranscript(full);
    };

    recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are not real errors
      if (event.error === "no-speech" || event.error === "aborted") return;
      cbRef.current.onError?.(event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
      const final = committed.join(" ").trim();
      if (final) {
        cbRef.current.onResult?.(final);
      }
      setTranscript("");
      setPartialTranscript("");
      cbRef.current.onEnd?.();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [lang, continuous, interimResults]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isAvailable,
    isListening,
    transcript,
    partialTranscript,
    start,
    stop,
    toggle,
  };
}

