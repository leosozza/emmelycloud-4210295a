import { useCallback, useEffect, useRef, useState } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AudioRecordButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** For Bitrix iframe: use raw fetch instead of supabase client */
  fetchTokenUrl?: string;
  fetchHeaders?: Record<string, string>;
  /** Force native Web Speech API instead of ElevenLabs */
  preferNative?: boolean;
  /** Language for native speech recognition */
  lang?: string;
}

type Engine = "elevenlabs" | "native" | null;

export function AudioRecordButton({
  onTranscript,
  disabled,
  fetchTokenUrl,
  fetchHeaders,
  preferNative = false,
  lang = "pt-PT",
}: AudioRecordButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeEngine, setActiveEngine] = useState<Engine>(null);
  const committedRef = useRef<string[]>([]);

  // --- ElevenLabs Scribe ---
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onCommittedTranscript: (data) => {
      committedRef.current.push(data.text);
    },
  });

  // Flush ElevenLabs transcript on disconnect
  const wasConnected = useRef(false);
  useEffect(() => {
    if (scribe.isConnected) {
      wasConnected.current = true;
    } else if (wasConnected.current) {
      wasConnected.current = false;
      const text = committedRef.current.join(" ").trim();
      if (text) onTranscript(text);
      committedRef.current = [];
      setActiveEngine(null);
    }
  }, [scribe.isConnected, onTranscript]);

  // --- Native Web Speech API ---
  const native = useSpeechRecognition({
    lang,
    onResult: (text) => {
      onTranscript(text);
      setActiveEngine(null);
    },
    onError: (err) => {
      console.warn("Native speech error:", err);
      toast.error("Erro no reconhecimento de voz do browser");
      setActiveEngine(null);
    },
    onEnd: () => {
      setActiveEngine(null);
    },
  });

  const isRecording = scribe.isConnected || native.isListening;
  const currentPartial = scribe.isConnected
    ? scribe.partialTranscript
    : native.partialTranscript;

  // --- Token fetch for ElevenLabs ---
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      if (fetchTokenUrl) {
        const res = await fetch(fetchTokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...fetchHeaders },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.token || null;
      }
      const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");
      if (error || !data?.token) return null;
      return data.token;
    } catch {
      return null;
    }
  }, [fetchTokenUrl, fetchHeaders]);

  // --- Start native fallback ---
  const startNative = useCallback(() => {
    if (!native.isAvailable) {
      toast.error("Reconhecimento de voz não suportado neste browser");
      return false;
    }
    setActiveEngine("native");
    native.start();
    return true;
  }, [native]);

  // --- Toggle handler ---
  const handleToggle = useCallback(async () => {
    // If already recording, stop whichever engine is active
    if (isRecording) {
      if (scribe.isConnected) scribe.disconnect();
      if (native.isListening) native.stop();
      return;
    }

    // If user prefers native, go straight to it
    if (preferNative) {
      startNative();
      return;
    }

    // Try ElevenLabs first, fallback to native
    setIsConnecting(true);
    try {
      const token = await getToken();
      if (token) {
        committedRef.current = [];
        setActiveEngine("elevenlabs");
        await scribe.connect({
          token,
          microphone: { echoCancellation: true, noiseSuppression: true },
        });
      } else {
        // No token → fallback to native
        if (!startNative()) {
          toast.error("Nenhum motor de voz disponível");
        }
      }
    } catch (e: any) {
      console.error("Audio recording error:", e);
      // Fallback to native on ElevenLabs failure
      if (!startNative()) {
        toast.error("Erro ao iniciar gravação de áudio");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isRecording, scribe, native, getToken, startNative, preferNative]);

  const engineLabel = activeEngine === "native" ? "Browser" : activeEngine === "elevenlabs" ? "ElevenLabs" : null;

  return (
    <div className="relative">
      <Button
        type="button"
        size="icon"
        variant={isRecording ? "destructive" : "ghost"}
        onClick={handleToggle}
        disabled={disabled || isConnecting}
        className={cn("shrink-0 self-end", isRecording && "animate-pulse")}
        title={isRecording ? "Parar gravação" : "Gravar áudio"}
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      {isRecording && (currentPartial || engineLabel) && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap max-w-[220px] truncate shadow-md flex items-center gap-1.5">
          {engineLabel && (
            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">
              {engineLabel}
            </span>
          )}
          {currentPartial && <span className="truncate">{currentPartial}</span>}
        </div>
      )}
    </div>
  );
}
