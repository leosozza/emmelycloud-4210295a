import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap } from "lucide-react";
import { useState } from "react";

interface QuickReply {
  id: string;
  title: string;
  content: string;
  category?: string | null;
}

interface QuickRepliesProps {
  replies: QuickReply[];
  onSelect: (content: string) => void;
}

export function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Respostas Rápidas</p>
        </div>
        <ScrollArea className="h-60">
          <div className="p-2 space-y-1">
            {replies.map((reply) => (
              <button
                key={reply.id}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                onClick={() => {
                  onSelect(reply.content);
                  setOpen(false);
                }}
              >
                <p className="font-medium text-foreground">{reply.title}</p>
                <p className="text-xs text-muted-foreground truncate">{reply.content}</p>
              </button>
            ))}
            {replies.length === 0 && (
              <p className="text-sm text-muted-foreground p-3 text-center">Nenhuma resposta rápida</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
