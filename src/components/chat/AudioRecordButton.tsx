import { useCallback, useEffect, useRef, useState } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mic, MicOff, Loader2, ChevronDown, Zap, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type VoiceEngine = "auto" | "elevenlabs" | "native";

interface AudioRecordButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  fetchTokenUrl?: string;
  fetchHeaders?: Record<string, string>;
  preferNative?: boolean;
  lang?: string;
  /** Show engine selector dropdown */
  showEngineSelector?: boolean;
  /** Controlled engine selection */
  engine?: VoiceEngine;
  onEngineChange?: (engine: VoiceEngine) => void;
}

type ActiveEngine = "elevenlabs" | "native" | null;

const STORAGE_KEY = "emmely-voice-engine";

export function AudioRecordButton({
  onTranscript,
  disabled,
  fetchTokenUrl,
  fetchHeaders,
  preferNative = false,
  lang = "pt-PT",
  showEngineSelector = false,
  engine: controlledEngine,
  onEngineChange,
}: AudioRecordButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeEngine, setActiveEngine] = useState<ActiveEngine>(null);
  const committedRef = useRef<string[]>([]);

  // Internal engine preference (uncontrolled mode)
  const [internalEngine, setInternalEngine] = useState<VoiceEngine>(() => {
    if (preferNative) return "native";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "elevenlabs" || saved === "native" || saved === "auto") return saved;
    } catch {}
    return "auto";
  });

  const selectedEngine = controlledEngine ?? internalEngine;

  const handleEngineSelect = useCallback((eng: VoiceEngine) => {
    if (onEngineChange) {
      onEngineChange(eng);
    } else {
      setInternalEngine(eng);
      try { localStorage.setItem(STORAGE_KEY, eng); } catch {}
    }
  }, [onEngineChange]);

  // --- ElevenLabs Scribe ---
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onCommittedTranscript: (data) => {
      committedRef.current.push(data.text);
    },
  });

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

  const startNative = useCallback(() => {
    if (!native.isAvailable) {
      toast.error("Reconhecimento de voz não suportado neste browser");
      return false;
    }
    setActiveEngine("native");
    native.start();
    return true;
  }, [native]);

  const startElevenLabs = useCallback(async (): Promise<boolean> => {
    const token = await getToken();
    if (!token) return false;
    committedRef.current = [];
    setActiveEngine("elevenlabs");
    await scribe.connect({
      token,
      microphone: { echoCancellation: true, noiseSuppression: true },
    });
    return true;
  }, [getToken, scribe]);

  const handleToggle = useCallback(async () => {
    if (isRecording) {
      if (scribe.isConnected) scribe.disconnect();
      if (native.isListening) native.stop();
      return;
    }

    setIsConnecting(true);
    try {
      if (selectedEngine === "native") {
        if (!startNative()) toast.error("Nenhum motor de voz disponível");
      } else if (selectedEngine === "elevenlabs") {
        const ok = await startElevenLabs();
        if (!ok) {
          toast.error("Não foi possível conectar ao ElevenLabs. Verifique as credenciais.");
        }
      } else {
        // Auto: try ElevenLabs first, fallback native
        const ok = await startElevenLabs().catch(() => false);
        if (!ok && !startNative()) {
          toast.error("Nenhum motor de voz disponível");
        }
      }
    } catch (e: any) {
      console.error("Audio recording error:", e);
      if (selectedEngine !== "elevenlabs" && !startNative()) {
        toast.error("Erro ao iniciar gravação de áudio");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isRecording, scribe, native, startNative, startElevenLabs, selectedEngine]);

  const engineLabel = activeEngine === "native" ? "Browser" : activeEngine === "elevenlabs" ? "ElevenLabs" : null;

  const engineOptions: { value: VoiceEngine; label: string; description: string; icon: React.ReactNode }[] = [
    { value: "auto", label: "Automático", description: "ElevenLabs → Browser", icon: <Zap className="h-3.5 w-3.5" /> },
    { value: "elevenlabs", label: "ElevenLabs", description: "Melhor qualidade (requer API key)", icon: <Zap className="h-3.5 w-3.5 text-amber-500" /> },
    { value: "native", label: "Browser", description: "Gratuito, sem API key", icon: <Globe className="h-3.5 w-3.5 text-blue-500" /> },
  ];

  return (
    <div className="relative flex items-end">
      <Button
        type="button"
        size="icon"
        variant={isRecording ? "destructive" : "ghost"}
        onClick={handleToggle}
        disabled={disabled || isConnecting}
        className={cn("shrink-0", isRecording && "animate-pulse", showEngineSelector && "rounded-r-none")}
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

      {showEngineSelector && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled || isConnecting || isRecording}
              className="shrink-0 rounded-l-none border-l border-border/50 w-6 px-0"
              title="Escolher motor de voz"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {engineOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => handleEngineSelect(opt.value)}
                className={cn(
                  "flex items-start gap-2.5 py-2",
                  selectedEngine === opt.value && "bg-accent"
                )}
              >
                <span className="mt-0.5 shrink-0">{opt.icon}</span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">{opt.description}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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