import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "./ChannelIcon";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { useState } from "react";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";
type Status = "aberta" | "em_atendimento" | "aguardando" | "fechada";

interface Conversation {
  id: string;
  channel: Channel;
  contact_name: string;
  contact_avatar_url?: string | null;
  status: Status;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const statusLabels: Record<Status, string> = {
  aberta: "Abertas",
  em_atendimento: "Em atendimento",
  aguardando: "Aguardando",
  fechada: "Fechadas",
};

function FormatTimeWrapper({ dateStr }: { dateStr: string }) {
  const { dateFnsLocale } = useLocale();
  const date = new Date(dateStr);
  if (isToday(date)) return <>{format(date, "HH:mm")}</>;
  if (isYesterday(date)) return <>Ontem</>;
  return <>{format(date, "dd/MM", { locale: dateFnsLocale })}</>;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  const filtered = conversations.filter((c) => {
    if (search && !c.contact_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "whatsapp", "instagram", "email"] as const).map((ch) => (
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
          {(["all", "aberta", "em_atendimento", "fechada"] as const).map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setStatusFilter(st)}
            >
              {st === "all" ? "Todos" : statusLabels[st]}
            </Button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filtered.map((conv) => (
            <button
              key={conv.id}
              className={cn(
                "w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors",
                selectedId === conv.id && "bg-accent"
              )}
              onClick={() => onSelect(conv.id)}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={conv.contact_avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">
                  {conv.contact_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{conv.contact_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ChannelIcon channel={conv.channel} />
                    {conv.last_message_at && (
                      <span className="text-[10px] text-muted-foreground">
                        <FormatTimeWrapper dateStr={conv.last_message_at} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground truncate pr-2">
                    {conv.last_message_preview || "Sem mensagens"}
                  </p>
                  {conv.unread_count > 0 && (
                    <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] shrink-0">
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma conversa encontrada</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
