import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelIcon } from "./ChannelIcon";
import { MessageBubble } from "./MessageBubble";
import { QuickReplies } from "./QuickReplies";
import { ChatInput, type MediaPayload } from "./ChatInput";
import {
  Bot,
  User,
  MoreVertical,
  X,
  CheckCheck,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { format, isSameDay } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSendMessage } from "@/hooks/useSendMessage";
import type { Conversation, Message, QuickReply } from "@/types/conversation";

interface ChatPanelProps {
  conversation: Conversation | null;
  messages: Message[];
  quickReplies: QuickReply[];
  onSendMessage: (content: string) => void;
  onSendMedia?: (media: MediaPayload) => void;
  onCloseConversation: () => void;
  onAttendanceModeChange?: (mode: "ai" | "human") => void;
}

const statusLabels: Record<string, string> = {
  aberta: "Aberta",
  em_atendimento: "Em atendimento",
  aguardando: "Aguardando",
  fechada: "Fechada",
};

const statusColors: Record<string, string> = {
  aberta: "bg-green-500/10 text-green-700 border-green-200",
  em_atendimento: "bg-blue-500/10 text-blue-700 border-blue-200",
  aguardando: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  fechada: "bg-muted text-muted-foreground",
};

export function ChatPanel({
  conversation,
  messages: externalMessages,
  quickReplies,
  onSendMessage,
  onSendMedia,
  onCloseConversation,
  onAttendanceModeChange,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevConvId = useRef<string | null>(null);

  // Merge external messages with optimistic local messages
  const allMessages = [
    ...externalMessages,
    ...localMessages.filter(
      (lm) => !externalMessages.some((em) => em.id === lm.id)
    ),
  ].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Clear local messages when conversation changes
  useEffect(() => {
    if (conversation?.id !== prevConvId.current) {
      setLocalMessages([]);
      prevConvId.current = conversation?.id ?? null;
    }
  }, [conversation?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length]);

  const optimisticCallbacks = {
    onOptimisticAdd: useCallback((msg: Message) => {
      setLocalMessages((prev) => [...prev, msg]);
    }, []),
    onOptimisticRemove: useCallback((id: string) => {
      setLocalMessages((prev) => prev.filter((m) => m.id !== id));
    }, []),
    onOptimisticConfirm: useCallback((id: string, _content: string) => {
      setLocalMessages((prev) => prev.filter((m) => m.id !== id));
    }, []),
  };

  const { sendMessage, sendMedia, sending } = useSendMessage(
    { conversation },
    optimisticCallbacks
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendMessage(trimmed);
    onSendMessage(trimmed); // notify parent for query invalidation
  }, [input, sendMessage, onSendMessage]);

  const handleSendMedia = useCallback(
    async (media: MediaPayload) => {
      await sendMedia(media);
      onSendMedia?.(media);
    },
    [sendMedia, onSendMedia]
  );

  const handleToggleAttendanceMode = async () => {
    if (!conversation) return;
    const newMode =
      conversation.attendance_mode === "ai" ? "human" : "ai";
    try {
      await supabase
        .from("conversations")
        .update({ attendance_mode: newMode } as any)
        .eq("id", conversation.id);
      onAttendanceModeChange?.(newMode);
      toast.success(
        newMode === "ai"
          ? "IA ativada para esta conversa"
          : "Modo humano ativado — IA pausada"
      );
    } catch {
      toast.error("Erro ao alterar modo de atendimento");
    }
  };

  const handleMarkAsRead = async () => {
    if (!conversation) return;
    await supabase
      .from("conversations")
      .update({ unread_count: 0 } as any)
      .eq("id", conversation.id);
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione uma conversa</p>
          <p className="text-sm">
            Escolha uma conversa na lista à esquerda para começar
          </p>
        </div>
      </div>
    );
  }

  const isAiMode = conversation.attendance_mode === "ai";

  // Group messages by day
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  allMessages.forEach((msg) => {
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
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {conversation.contact_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {conversation.contact_name}
              </span>
              <ChannelIcon channel={conversation.channel} />
              {/* Attendance mode badge */}
              <Badge
                variant="outline"
                className={`text-[10px] h-5 flex items-center gap-1 ${
                  isAiMode
                    ? "bg-violet-500/10 text-violet-700 border-violet-200"
                    : "bg-orange-500/10 text-orange-700 border-orange-200"
                }`}
              >
                {isAiMode ? (
                  <Bot className="h-2.5 w-2.5" />
                ) : (
                  <User className="h-2.5 w-2.5" />
                )}
                {isAiMode ? "IA" : "Humano"}
              </Badge>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] h-5 ${
                statusColors[conversation.status] ?? ""
              }`}
            >
              {statusLabels[conversation.status] ?? conversation.status}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Toggle AI/Human */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleToggleAttendanceMode}
            title={isAiMode ? "Transferir para humano" : "Ativar IA"}
          >
            {isAiMode ? (
              <>
                <User className="h-3 w-3" /> Humano
              </>
            ) : (
              <>
                <Bot className="h-3 w-3" /> IA
              </>
            )}
          </Button>

          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleMarkAsRead}>
                <CheckCheck className="h-4 w-4 mr-2" />
                Marcar como lida
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {conversation.status !== "fechada" && (
                <DropdownMenuItem
                  onClick={onCloseConversation}
                  className="text-destructive"
                >
                  <X className="h-4 w-4 mr-2" />
                  Fechar conversa
                </DropdownMenuItem>
              )}
              {conversation.status === "fechada" && (
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase
                      .from("conversations")
                      .update({ status: "aberta" } as any)
                      .eq("id", conversation.id);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reabrir conversa
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* AI mode banner */}
      {isAiMode && (
        <div className="px-4 py-1.5 bg-violet-50 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900 flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-violet-600" />
          <span className="text-xs text-violet-700 dark:text-violet-400">
            A IA está respondendo automaticamente nesta conversa. Clique em{" "}
            <strong>Humano</strong> para assumir o atendimento.
          </span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-0.5">
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
                msg={msg}
                conversationId={conversation.id}
              />
            ))}
          </div>
        ))}
        {allMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              Nenhuma mensagem ainda
            </p>
          </div>
        )}
      </div>

      {/* Input */}
      {conversation.status !== "fechada" && (
        <div className="border-t bg-card p-3">
          <div className="flex items-end gap-2">
            <QuickReplies
              replies={quickReplies}
              onSelect={(content) => setInput(content)}
            />
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onSendMedia={handleSendMedia}
              sending={sending}
              placeholder={
                isAiMode
                  ? "Escrever mensagem (a IA está ativa — sua mensagem será enviada como atendente)..."
                  : "Escrever mensagem..."
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
