import React, { useRef, useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Mic, MicOff, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { calcTextareaHeight } from "@/lib/messageLayout";

export interface MediaPayload {
  type: "audio" | "image" | "video" | "document";
  base64: string;
  fileName?: string;
  mimeType: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendMedia?: (media: MediaPayload) => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onSendMedia,
  disabled = false,
  sending = false,
  placeholder = "Digite uma mensagem...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const el = e.target;
    // Use canvas-based height calc to avoid DOM reflow
    const w = el.offsetWidth;
    if (w > 0) {
      const h = calcTextareaHeight(e.target.value, w);
      el.style.height = h + "px";
    } else {
      el.style.height = "44px";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleSendClick = () => {
    onSend();
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  // === Audio Recording ===
  const startRecording = async () => {
    if (!onSendMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")
        ? "audio/ogg; codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm; codecs=opus")
          ? "audio/webm; codecs=opus"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecordingTime(0);

        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
          if (base64) {
            onSendMedia({
              type: "audio",
              base64,
              // Use the REAL recorded mime (Chrome usually gives webm/opus, not ogg).
              // Lying about the container makes WhatsApp silently drop the PTT.
              mimeType,
              fileName: `audio-${Date.now()}.${mimeType.includes("ogg") ? "ogg" : "webm"}`,
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    setRecording(false);
    setMediaRecorder(null);
  };

  const cancelRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = () => {
        mediaRecorder.stream?.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setMediaRecorder(null);
    setRecordingTime(0);
  };

  // === File Attachment ===
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSendMedia) return;

    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo: 16MB");
      return;
    }

    let type: MediaPayload["type"] = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";
    else if (file.type.startsWith("audio/")) type = "audio";

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (base64) {
        onSendMedia({
          type,
          base64,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        });
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // === Recording UI ===
  if (recording) {
    return (
      <div className="chat-input-area p-2.5 md:p-3 flex-shrink-0">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 h-11 w-11 rounded-full text-destructive hover:bg-destructive/10"
            onClick={cancelRecording}
            aria-label="Cancelar gravação"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-destructive">
              Gravando {formatTime(recordingTime)}
            </span>
          </div>
          <Button
            size="icon"
            className="shrink-0 h-11 w-11 rounded-full bg-primary hover:bg-primary/90 shadow-md"
            onClick={stopRecording}
            aria-label="Enviar áudio"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendClick();
  };

  return (
    <form onSubmit={handleFormSubmit} className="chat-input-area p-2.5 md:p-3 flex-shrink-0">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        {/* Attachment button */}
        {onSendMedia && (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 h-11 w-11 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              aria-label="Anexar arquivo"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={handleFileSelect}
            />
          </>
        )}

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            className="bg-secondary/50 border-0 rounded-[22px] text-sm pl-4 pr-4 py-3 resize-none overflow-hidden"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            disabled={disabled}
            rows={1}
          />
        </div>

        {/* Send or Mic button */}
        {value.trim() ? (
          <Button
            type="submit"
            size="icon"
            className="shrink-0 h-11 w-11 rounded-full bg-primary hover:bg-primary/90 shadow-md"
            disabled={!value.trim() || sending || disabled}
            aria-label="Enviar mensagem"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        ) : onSendMedia ? (
          <Button
            type="button"
            size="icon"
            className="shrink-0 h-11 w-11 rounded-full bg-primary hover:bg-primary/90 shadow-md"
            onClick={startRecording}
            disabled={sending || disabled}
            aria-label="Gravar áudio"
          >
            <Mic className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="shrink-0 h-11 w-11 rounded-full bg-primary hover:bg-primary/90 shadow-md"
            disabled={!value.trim() || sending || disabled}
            aria-label="Enviar mensagem"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>
    </form>
  );
}
