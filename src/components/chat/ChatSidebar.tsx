import { Plus, MessageSquare, Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
}

interface Agent {
  id: string;
  name: string;
  welcome_message: string | null;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  agents: Agent[];
  selectedAgentId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onSelectAgent: (id: string) => void;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  agents,
  selectedAgentId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onSelectAgent,
}: ChatSidebarProps) {
  return (
    <div className="w-64 border-r bg-card flex flex-col h-full">
      <div className="p-3 border-b space-y-3">
        <Button onClick={onNewSession} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova conversa
        </Button>
        <div>
          <Select value={selectedAgentId} onValueChange={onSelectAgent}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Agente" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-1.5">
                    <Bot className="h-3 w-3" />
                    {a.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                s.id === activeSessionId
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => onSelectSession(s.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhuma conversa ainda
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
