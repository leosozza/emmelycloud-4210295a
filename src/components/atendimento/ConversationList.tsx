import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "./ChannelIcon";
import { Search, Bot, User, BellDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Conversation, ConversationChannel, ConversationStatus } from "@/types/conversation";

type QuickFilter = "all" | "unread" | "ai" | "human";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onDoubleSelect?: (id: string) => void;
}

function FormatTimeWrapper({ dateStr }: { dateStr: string }) {
  const { dateFnsLocale } = useLocale();
  const date = new Date(dateStr);
  if (isToday(date)) return <>{format(date, "HH:mm")}</>;
  if (isYesterday(date)) return <>Ontem</>;
  return <>{format(date, "dd/MM", { locale: dateFnsLocale })}</>;
}

const channelLabels: Record<ConversationChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-mail",
  webchat: "Webchat",
};

const ITEM_HEIGHT = 70;

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDoubleSelect,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ConversationChannel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("aberta");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const listRef = useRef<HTMLDivElement>(null);

  const channelBorderColor: Record<ConversationChannel, string> = {
    whatsapp: "border-l-[hsl(142,70%,45%)]",
    instagram: "border-l-[hsl(330,70%,55%)]",
    email: "border-l-[hsl(210,80%,55%)]",
    webchat: "border-l-muted-foreground/40",
  };

  const counters = useMemo(() => {
    const base = conversations.filter(
      (c) =>
        (statusFilter === "all" || c.status === statusFilter) &&
        (channelFilter === "all" || c.channel === channelFilter)
    );
    return {
      all: base.length,
      unread: base.filter((c) => c.unread_count > 0).length,
      ai: base.filter((c) => c.attendance_mode === "ai").length,
      human: base.filter((c) => c.attendance_mode === "human").length,
    };
  }, [conversations, statusFilter, channelFilter]);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (
        search &&
        !c.contact_name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.contact_phone ?? "").includes(search)
      )
        return false;
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (quickFilter === "unread" && c.unread_count === 0) return false;
      if (quickFilter === "ai" && c.attendance_mode !== "ai") return false;
      if (quickFilter === "human" && c.attendance_mode !== "human") return false;
      return true;
    });
  }, [conversations, search, channelFilter, statusFilter, quickFilter]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-3 border-b space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-1">
          {(
            [
              { key: "all", label: "Todas", icon: null },
              { key: "unread", label: "Não lidas", icon: <BellDot className="h-3 w-3" /> },
              { key: "ai", label: "IA", icon: <Bot className="h-3 w-3" /> },
              { key: "human", label: "Humano", icon: <User className="h-3 w-3" /> },
            ] as { key: QuickFilter; label: string; icon: React.ReactNode }[]
          ).map(({ key, label, icon }) => (
            <Button
              key={key}
              variant={quickFilter === key ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2 flex items-center gap-1"
              onClick={() => setQuickFilter(key)}
            >
              {icon}
              {label}
              {counters[key] > 0 && (
                <span
                  className={cn(
                    "ml-0.5 text-[10px] font-bold rounded-full px-1",
                    quickFilter === key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {counters[key]}
                </span>
              )}
            </Button>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap">
          {(["all", "whatsapp"] as const).map((ch) => (
            <Button
              key={ch}
              variant={channelFilter === ch ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setChannelFilter(ch)}
            >
              {ch === "all" ? "Todos" : <ChannelIcon channel={ch} showLabel />}
            </Button>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap">
          {(
            [
              { key: "aberta", label: "Abertas" },
              { key: "em_atendimento", label: "Em atend." },
              { key: "aguardando", label: "Aguardando" },
              { key: "fechada", label: "Fechadas" },
              { key: "all", label: "Todas" },
            ] as { key: ConversationStatus | "all"; label: string }[]
          ).map(({ key, label }) => (
            <Button
              key={key}
              variant={statusFilter === key ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Virtualized conversation items */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">
            Nenhuma conversa encontrada
          </p>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const conv = filtered[vRow.index];
              return (
                <button
                  key={conv.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className={cn(
                    "w-full text-left px-3 py-[10px] border-b border-border/30 border-l-4 hover:bg-accent/50 transition-colors",
                    channelBorderColor[conv.channel],
                    selectedId === conv.id && "bg-primary/10",
                    conv.unread_count > 0 && "bg-primary/5"
                  )}
                  onClick={() => onSelect(conv.id)}
                  onDoubleClick={() => onDoubleSelect?.(conv.id)}
                  title="Clique duplo para ver detalhes do contacto"
                >
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <div className="relative shrink-0">
                      <Avatar className="h-[49px] w-[49px]">
                        <AvatarImage src={conv.contact_avatar_url ?? undefined} />
                        <AvatarFallback className="text-[15px] font-semibold bg-primary/10 text-primary">
                          {conv.contact_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <ChannelIcon channel={conv.channel} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={cn(
                              "text-[15px] truncate",
                              conv.unread_count > 0 ? "font-bold" : "font-normal"
                            )}
                          >
                            {conv.contact_name}
                          </span>
                          {conv.attendance_mode === "ai" && (
                            <Bot className="h-3 w-3 text-violet-500 shrink-0" />
                          )}
                        </div>
                        {conv.last_message_at && (
                          <span
                            className={cn(
                              "text-[12px] whitespace-nowrap shrink-0",
                              conv.unread_count > 0
                                ? "text-primary font-semibold"
                                : "text-muted-foreground"
                            )}
                          >
                            <FormatTimeWrapper dateStr={conv.last_message_at} />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-[2px] gap-1">
                        <p
                          className={cn(
                            "text-[13px] truncate flex-1 min-w-0",
                            conv.unread_count > 0
                              ? "text-foreground/70 font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {conv.last_message_preview || "Sem mensagens"}
                        </p>
                        {conv.unread_count > 0 && (
                          <Badge className="h-5 min-w-5 rounded-full px-1.5 py-0 flex items-center justify-center text-[11px] font-bold shrink-0 bg-primary text-primary-foreground">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
