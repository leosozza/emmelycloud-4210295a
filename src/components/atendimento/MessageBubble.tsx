import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  User,
  Smartphone,
  Building2,
  Check,
  CheckCheck,
  Clock,
  ThumbsUp,
  ThumbsDown,
  FileText,
} from "lucide-react";
import { AudioMessageBubble } from "@/components/atendimento/AudioMessageBubble";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { shrinkWrapWidth } from "@/lib/messageLayout";
import type { Message } from "@/types/conversation";

// Source label helper
function getSourceLabel(msg: Message) {
  const isOutgoing = msg.direction === "outgoing" || msg.direction === "outbound";
  if (!isOutgoing) return null;
  if (msg.is_from_bot) return { icon: <Bot className="h-3 w-3" />, label: "Emmely.AI", className: "chat-source-label-ai" };
  const source = msg.metadata?.source as string | undefined;
  if (source === "emmely_app" || source === "thoth_app") return { icon: <User className="h-3 w-3" />, label: "Atendente", className: "chat-source-label-operator" };
  if (source === "bitrix24_operator") return { icon: <Building2 className="h-3 w-3" />, label: "Bitrix24", className: "chat-source-label" };
  if (source === "whatsapp_manual") return { icon: <Smartphone className="h-3 w-3" />, label: "WhatsApp", className: "chat-source-label-operator" };
  return null;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "sent":
      return <Check className="h-3 w-3" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-primary" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

interface MessageBubbleProps {
  msg: Message;
  conversationId?: string;
  workspaceId?: string;
  containerWidth?: number;
}

export function MessageBubble({ msg, conversationId, workspaceId, containerWidth }: MessageBubbleProps) {
  const isOutgoing = msg.direction === "outgoing" || msg.direction === "outbound";
  const sourceLabel = getSourceLabel(msg);
  const [feedbackGiven, setFeedbackGiven] = useState<"up" | "down" | null>(null);

  // Shrink-wrap: compute tight bubble width if we have text and container info
  const bubbleStyle = useMemo(() => {
    if (!msg.content || !containerWidth || containerWidth < 100) return {};
    const isMobile = containerWidth < 640;
    const maxW = Math.floor(containerWidth * (isMobile ? 0.8 : 0.65));
    const tight = shrinkWrapWidth(msg.content, maxW - 28); // 28 = px-3.5 * 2
    if (tight < maxW) {
      return { maxWidth: `${Math.min(tight, maxW)}px` };
    }
    return {};
  }, [msg.content, containerWidth]);

  const bubbleClass = !isOutgoing
    ? "msg-bubble-client"
    : msg.is_from_bot
      ? "msg-bubble-ai"
      : "msg-bubble-operator";

  const showFeedback = msg.is_from_bot && isOutgoing && msg.content;

  // Normalise media kind: DB uses media_type; legacy code used message_type.
  // Also infer from mime/url when only one is set.
  const rawType = (msg.media_type || msg.message_type || "").toString().toLowerCase();
  const mediaKind: "audio" | "image" | "video" | "document" | null =
    rawType.includes("audio") || rawType === "ptt" ? "audio"
    : rawType.includes("image") || rawType.includes("sticker") || rawType === "photo" ? "image"
    : rawType.includes("video") ? "video"
    : rawType.includes("document") || rawType.includes("file") || rawType === "pdf" ? "document"
    : null;
  const hasHttpUrl = !!msg.media_url && /^https?:\/\//i.test(msg.media_url);
  const hasDataUri = !!msg.media_url && msg.media_url.startsWith("data:");

  const handleFeedback = async (rating: "up" | "down") => {
    if (feedbackGiven) return;
    setFeedbackGiven(rating);
    try {
      await supabase.from("conversation_feedback" as any).insert({
        conversation_id: conversationId || msg.conversation_id,
        workspace_id: workspaceId,
        message_id: msg.id,
        rating: rating === "up" ? 5 : 1,
        feedback_type: "thumbs",
      });
    } catch {
      toast.error("Erro ao enviar feedback");
    }
  };

  return (
    <div className={cn("flex mb-2", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[80%] md:max-w-[65%] px-3.5 py-2 overflow-hidden break-words",
          bubbleClass
        )}
        style={bubbleStyle}
      >
        {/* Source label */}
        {sourceLabel && (
          <div className={cn("flex items-center gap-1 mb-1 font-semibold", sourceLabel.className)}>
            {sourceLabel.icon}
            <span className="text-[11px]">{sourceLabel.label}</span>
          </div>
        )}

        {/* Media */}
        {mediaKind === "audio" && (hasHttpUrl || hasDataUri) ? (
          <AudioMessageBubble msg={{ id: msg.id, media_url: msg.media_url!, message_type: "audio" }} />
        ) : mediaKind === "audio" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-background/40 border border-border/40">
            <span>🎤</span>
            <span>Áudio recebido — mídia não baixada</span>
          </div>
        ) : mediaKind === "image" && (hasHttpUrl || hasDataUri) ? (
          <div className="mt-1 mb-2">
            <img
              src={msg.media_url!}
              alt="Mídia"
              className="max-w-full rounded-lg border border-border/50 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onClick={() => window.open(msg.media_url!, "_blank")}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        ) : mediaKind === "image" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-background/40 border border-border/40">
            <span>🖼️</span>
            <span>Imagem recebida — mídia não baixada</span>
          </div>
        ) : mediaKind === "video" && (hasHttpUrl || hasDataUri) ? (
          <video controls className="max-w-full rounded-lg mb-1" preload="none">
            <source src={msg.media_url!} />
          </video>
        ) : mediaKind === "video" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-background/40 border border-border/40">
            <span>🎬</span>
            <span>Vídeo recebido — mídia não baixada</span>
          </div>
        ) : mediaKind === "document" && hasHttpUrl ? (
          <div className="mt-1 mb-2">
            <a
              href={msg.media_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded-md bg-background/50 border border-border/50 text-xs font-medium hover:bg-background/80 transition-colors"
            >
              <div className="p-1.5 rounded bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate max-w-[180px]">{msg.content || "Documento"}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Documento</span>
              </div>
            </a>
          </div>
        ) : mediaKind === "document" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-background/40 border border-border/40">
            <span>📎</span>
            <span>Documento recebido — mídia não baixada</span>
          </div>
        ) : null}

        {/* Text content (skip placeholder labels when we already render a media card) */}
        {msg.content && !(mediaKind && /^\[(Áudio|Imagem|Vídeo|Documento)\]/.test(msg.content)) && (
          <p className="text-[13.5px] leading-[1.4] whitespace-pre-wrap">{msg.content}</p>
        )}

        {/* Time + status + feedback */}
        <div className="flex items-center justify-end gap-1 mt-1">
          {showFeedback && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={() => handleFeedback("up")}
                className={cn(
                  "p-0.5 rounded transition-colors",
                  feedbackGiven === "up" ? "text-green-500" : "text-muted-foreground/40 hover:text-green-500"
                )}
                disabled={!!feedbackGiven}
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleFeedback("down")}
                className={cn(
                  "p-0.5 rounded transition-colors",
                  feedbackGiven === "down" ? "text-destructive" : "text-muted-foreground/40 hover:text-destructive"
                )}
                disabled={!!feedbackGiven}
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
            </div>
          )}
          <span className="chat-msg-time">
            {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isOutgoing && (
            <span className={cn(
              msg.status === "read" ? "text-primary" : "text-muted-foreground"
            )}>
              {getStatusIcon(msg.status)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
