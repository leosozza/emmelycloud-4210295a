import { useCallback, useEffect, useRef, useState } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
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
}

export function AudioRecordButton({
  onTranscript,
  disabled,
  fetchTokenUrl,
  fetchHeaders,
}: AudioRecordButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const committedRef = useRef<string[]>([]);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onCommittedTranscript: (data) => {
      committedRef.current.push(data.text);
    },
  });

  // When disconnected after recording, flush transcript
  const wasConnected = useRef(false);
  useEffect(() => {
    if (scribe.isConnected) {
      wasConnected.current = true;
    } else if (wasConnected.current) {
      wasConnected.current = false;
      const text = committedRef.current.join(" ").trim();
      if (text) {
        onTranscript(text);
      }
      committedRef.current = [];
    }
  }, [scribe.isConnected, onTranscript]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (fetchTokenUrl) {
      const res = await fetch(fetchTokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...fetchHeaders },
      });
      const data = await res.json();
      return data?.token || null;
    }
    const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");
    if (error || !data?.token) return null;
    return data.token;
  }, [fetchTokenUrl, fetchHeaders]);

  const handleToggle = useCallback(async () => {
    if (scribe.isConnected) {
      scribe.disconnect();
      return;
    }

    setIsConnecting(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Não foi possível obter token de transcrição. Verifique as credenciais ElevenLabs.");
        return;
      }
      committedRef.current = [];
      await scribe.connect({
        token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (e: any) {
      console.error("Audio recording error:", e);
      toast.error("Erro ao iniciar gravação de áudio");
    } finally {
      setIsConnecting(false);
    }
  }, [scribe, getToken]);

  return (
    <div className="relative">
      <Button
        type="button"
        size="icon"
        variant={scribe.isConnected ? "destructive" : "ghost"}
        onClick={handleToggle}
        disabled={disabled || isConnecting}
        className={cn("shrink-0 self-end", scribe.isConnected && "animate-pulse")}
        title={scribe.isConnected ? "Parar gravação" : "Gravar áudio"}
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : scribe.isConnected ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      {scribe.isConnected && scribe.partialTranscript && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap max-w-[200px] truncate shadow-md">
          {scribe.partialTranscript}
        </div>
      )}
    </div>
  );
}
