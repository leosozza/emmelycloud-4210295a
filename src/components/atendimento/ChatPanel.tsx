import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ChannelIcon } from "./ChannelIcon";
import { MessageBubble } from "./MessageBubble";
import { QuickReplies } from "./QuickReplies";
import { Send, Paperclip, X, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useEffect } from "react";
import { format, isSameDay } from "date-fns";
import { pt } from "date-fns/locale";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";
type Status = "aberta" | "em_atendimento" | "aguardando" | "fechada";
type Direction = "inbound" | "outbound";

interface Message {
  id: string;
  direction: Direction;
  content: string;
  sender_name?: string | null;
  created_at: string;
  read_at?: string | null;
  delivery_status?: string | null;
}

interface QuickReply {
  id: string;
  title: string;
  content: string;
  category?: string | null;
}

interface Conversation {
  id: string;
  channel: Channel;
  contact_name: string;
  contact_avatar_url?: string | null;
  status: Status;
}

interface ChatPanelProps {
  conversation: Conversation | null;
  messages: Message[];
  quickReplies: QuickReply[];
  onSendMessage: (content: string) => void;
  onCloseConversation: () => void;
}

const statusLabels: Record<Status, string> = {
  aberta: "Aberta",
  em_atendimento: "Em atendimento",
  aguardando: "Aguardando",
  fechada: "Fechada",
};

const statusColors: Record<Status, string> = {
  aberta: "bg-green-500/10 text-green-700 border-green-200",
  em_atendimento: "bg-blue-500/10 text-blue-700 border-blue-200",
  aguardando: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  fechada: "bg-muted text-muted-foreground",
};

export function ChatPanel({ conversation, messages, quickReplies, onSendMessage, onCloseConversation }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione uma conversa</p>
          <p className="text-sm">Escolha uma conversa na lista à esquerda para começar</p>
        </div>
      </div>
    );
  }

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by day
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  messages.forEach((msg) => {
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && isSameDay(new Date(last.date), new Date(msg.created_at))) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date: msg.created_at, messages: [msg] });
    }
  });

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={conversation.contact_avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {conversation.contact_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{conversation.contact_name}</span>
              <ChannelIcon channel={conversation.channel} />
            </div>
            <Badge variant="outline" className={`text-[10px] h-5 ${statusColors[conversation.status]}`}>
              {statusLabels[conversation.status]}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {conversation.status !== "fechada" && (
            <Button variant="ghost" size="sm" onClick={onCloseConversation} className="text-xs">
              <X className="h-3 w-3 mr-1" /> Fechar
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="flex items-center justify-center my-4">
              <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {format(new Date(group.date), "dd 'de' MMMM", { locale: pt })}
              </span>
            </div>
            {group.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                id={msg.id}
                content={msg.content}
                direction={msg.direction}
                senderName={msg.sender_name ?? undefined}
                createdAt={msg.created_at}
                readAt={msg.read_at}
                deliveryStatus={msg.delivery_status}
                conversationId={conversation.id}
                showFeedback={msg.direction === "outbound"}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Input */}
      {conversation.status !== "fechada" && (
        <div className="border-t bg-card p-3">
          <div className="flex items-end gap-2">
            <QuickReplies
              replies={quickReplies}
              onSelect={(content) => setInput(content)}
            />
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escrever mensagem..."
              className="min-h-[40px] max-h-[120px] resize-none text-sm"
              rows={1}
            />
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
