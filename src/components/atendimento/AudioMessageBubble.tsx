import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AudioMessage {
  id: string;
  media_url: string | null;
  message_type: string;
}

interface AudioMessageBubbleProps {
  msg: AudioMessage;
}

export function AudioMessageBubble({ msg }: AudioMessageBubbleProps) {
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const handleTranscribe = async () => {
    if (!msg.media_url) return;
    setTranscribing(true);
    try {
      // Determine if media_url is a data URI or a regular URL
      const isDataUri = msg.media_url.startsWith("data:");
      const body: Record<string, string> = { language_code: "por" };

      if (isDataUri) {
        // Pass full data URI so the edge function can recover MIME type
        body.audio_base64 = msg.media_url;
      } else {
        body.audio_url = msg.media_url;
      }

      const { data, error } = await supabase.functions.invoke("elevenlabs-stt", {
        body,
      });
      if (error) throw error;
      if (data?.text) {
        setTranscript(data.text);
        setShowTranscript(true);
      } else {
        toast.error("Não foi possível transcrever o áudio");
      }
    } catch (err) {
      console.error("Transcription error:", err);
      toast.error("Erro ao transcrever áudio");
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 opacity-70" />
        <span className="text-xs opacity-70">Mensagem de voz</span>
      </div>
      {msg.media_url && (
        <audio controls className="max-w-full" preload="none">
          <source src={msg.media_url} />
        </audio>
      )}
      <div className="flex items-center gap-1 mt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={transcript ? () => setShowTranscript(!showTranscript) : handleTranscribe}
          disabled={transcribing}
        >
          {transcribing ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Transcrevendo...</>
          ) : transcript ? (
            <><FileText className="h-3 w-3 mr-1" />{showTranscript ? "Ocultar" : "Ver transcrição"}</>
          ) : (
            <><FileText className="h-3 w-3 mr-1" />Transcrever</>
          )}
        </Button>
      </div>
      {showTranscript && transcript && (
        <div className="text-xs bg-background/50 rounded p-2 mt-1 italic border">
          "{transcript}"
        </div>
      )}
    </div>
  );
}
