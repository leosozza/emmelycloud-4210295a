import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Play, Pause, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AudioMessage {
  id: string;
  media_url: string | null;
  message_type: string;
  content?: string | null;
}

interface AudioMessageBubbleProps {
  msg: AudioMessage;
  isOutgoing?: boolean;
}

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AudioMessageBubble({ msg, isOutgoing = false }: AudioMessageBubbleProps) {
  const initialTranscript =
    msg.content && !["[Áudio]", "🎤 Áudio", "audio"].includes(msg.content.trim())
      ? msg.content.replace(/^🎤\s*/, "")
      : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoTriedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(initialTranscript);
  const [showTranscript, setShowTranscript] = useState(false);

  // Pseudo-waveform bars (deterministic per message id)
  const bars = useMemo(() => {
    const seed = msg.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 36 }, (_, i) => {
      const v = Math.abs(Math.sin(seed * 0.13 + i * 0.7)) * 0.8 + 0.2;
      return v;
    });
  }, [msg.id]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      try {
        await a.play();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, pct * duration));
  };

  const handleTranscribe = async () => {
    if (!msg.media_url) return;
    setTranscribing(true);
    try {
      const isDataUri = msg.media_url.startsWith("data:");
      const body: Record<string, string> = { language_code: "por" };
      if (isDataUri) body.audio_base64 = msg.media_url;
      else body.audio_url = msg.media_url;

      const { data, error } = await supabase.functions.invoke("elevenlabs-stt", { body });
      if (error) throw error;
      if (data?.text) {
        setTranscript(data.text);
        setShowTranscript(true);
        try {
          await supabase.from("messages").update({ content: `🎤 ${data.text}` }).eq("id", msg.id);
        } catch {}
      } else if (!autoTriedRef.current) {
        toast.error("Não foi possível transcrever o áudio");
      }
    } catch (err) {
      console.error("Transcription error:", err);
      toast.error("Erro ao transcrever áudio");
    } finally {
      setTranscribing(false);
    }
  };

  useEffect(() => {
    if (!transcript && msg.media_url && !autoTriedRef.current) {
      autoTriedRef.current = true;
      handleTranscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.media_url]);

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const activeIdx = Math.floor((pct / 100) * bars.length);

  return (
    <div className="space-y-1.5 min-w-[260px]">
      <div className="flex items-center gap-2.5">
        {/* Avatar/mic circle */}
        <div className="relative h-9 w-9 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
          <Mic className="h-4 w-4 text-primary" />
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Mic className="h-2 w-2" />
          </span>
        </div>

        {/* Play */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={!msg.media_url}
          className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition disabled:opacity-50"
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        {/* Waveform + time */}
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-[2px] h-7 cursor-pointer"
            onClick={handleSeek}
          >
            {bars.map((h, i) => (
              <span
                key={i}
                className={cn(
                  "w-[2px] rounded-full transition-colors",
                  i <= activeIdx ? "bg-primary" : "bg-foreground/25"
                )}
                style={{ height: `${Math.max(20, h * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {msg.media_url && (
        <audio
          ref={audioRef}
          src={msg.media_url}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration || 0)}
          onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
        />
      )}

      {/* Transcription toggle */}
      <button
        type="button"
        onClick={transcript ? () => setShowTranscript(!showTranscript) : handleTranscribe}
        disabled={transcribing}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
      >
        {transcribing ? (
          <><Loader2 className="h-3 w-3 animate-spin" />Transcrevendo…</>
        ) : transcript ? (
          <><FileText className="h-3 w-3" />{showTranscript ? "Ocultar transcrição" : "Ver transcrição"}</>
        ) : (
          <><FileText className="h-3 w-3" />Transcrever</>
        )}
      </button>

      {showTranscript && transcript && (
        <div className="text-xs bg-background/60 rounded-md p-2 italic border border-border/50 leading-relaxed">
          "{transcript}"
        </div>
      )}
    </div>
  );
}
