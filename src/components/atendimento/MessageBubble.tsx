import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Check, CheckCheck } from "lucide-react";

interface MessageBubbleProps {
  content: string;
  direction: "inbound" | "outbound";
  senderName?: string;
  createdAt: string;
  readAt?: string | null;
}

export function MessageBubble({ content, direction, senderName, createdAt, readAt }: MessageBubbleProps) {
  const isOutbound = direction === "outbound";

  return (
    <div className={cn("flex mb-2", isOutbound ? "justify-end" : "justify-start")}>
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
          {isOutbound && (
            readAt ? (
              <CheckCheck className="h-3 w-3 text-blue-400" />
            ) : (
              <Check className="h-3 w-3 opacity-60" />
            )
          )}
        </div>
      </div>
    </div>
  );
}
