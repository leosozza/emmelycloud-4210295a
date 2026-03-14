import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface MessageBubbleProps {
  id?: string;
  content: string;
  direction: "inbound" | "outbound";
  senderName?: string;
  createdAt: string;
  readAt?: string | null;
  deliveryStatus?: string | null;
  conversationId?: string;
  showFeedback?: boolean;
}

export function MessageBubble({ id, content, direction, senderName, createdAt, readAt, deliveryStatus, conversationId, showFeedback }: MessageBubbleProps) {
  const isOutbound = direction === "outbound";
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null);

  const handleFeedback = async (rating: number) => {
    if (!conversationId || feedbackGiven !== null) return;
    setFeedbackGiven(rating);
    await supabase.from("conversation_feedback").insert({
      conversation_id: conversationId,
      message_id: id || null,
      rating,
      comment: rating >= 4 ? "thumbs_up" : "thumbs_down",
    } as any).catch(() => {});
  };

  const renderStatusIcon = () => {
    if (!isOutbound) return null;

    const status = deliveryStatus || (readAt ? "read" : "sent");

    switch (status) {
      case "read":
        return <CheckCheck className="h-3 w-3 text-blue-400" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 opacity-60" />;
      case "sent":
        return <Check className="h-3 w-3 opacity-60" />;
      default:
        return <Clock className="h-3 w-3 opacity-40" />;
    }
  };

  const canShowFeedback = showFeedback && isOutbound && senderName;

  return (
    <div className={cn("flex mb-2 group", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          isOutbound
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {!isOutbound && senderName && (
          <p className="text-xs font-semibold mb-1 opacity-70">{senderName}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{content}</p>
        <div className={cn("flex items-center gap-1 mt-1", isOutbound ? "justify-end" : "justify-start")}>
          <span className="text-[10px] opacity-60">
            {format(new Date(createdAt), "HH:mm")}
          </span>
          {renderStatusIcon()}
        </div>
      </div>
      {canShowFeedback && (
        <div className={cn(
          "flex flex-col gap-0.5 ml-1 self-end",
          feedbackGiven !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
        )}>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6", feedbackGiven === 5 && "text-green-500")}
            onClick={() => handleFeedback(5)}
            disabled={feedbackGiven !== null}
          >
            <ThumbsUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6", feedbackGiven === 1 && "text-destructive")}
            onClick={() => handleFeedback(1)}
            disabled={feedbackGiven !== null}
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
