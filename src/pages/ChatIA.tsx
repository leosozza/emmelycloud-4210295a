import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AudioRecordButton } from "@/components/chat/AudioRecordButton";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  agent_id: string | null;
  messages: Message[];
  updated_at: string;
}

interface Agent {
  id: string;
  name: string;
  welcome_message: string | null;
}

export default function ChatIAPage() {
  const { session: authSession } = useAuthContext();
  const userId = authSession?.user?.id;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // Load agents
  useEffect(() => {
    supabase
      .from("ai_agents")
      .select("id, name, welcome_message")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        if (data) {
          const typed = data as unknown as Agent[];
          setAgents(typed);
          if (typed.length > 0) setSelectedAgentId(typed[0].id);
        }
      });
  }, []);

  // Load sessions
  const loadSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("chat_sessions" as any)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (data) setSessions(data as unknown as ChatSession[]);
  }, [userId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const selectSession = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (s) {
      setActiveSessionId(id);
      setMessages(s.messages || []);
      if (s.agent_id) setSelectedAgentId(s.agent_id);
    }
  };

  const createNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  const deleteSession = async (id: string) => {
    await supabase.from("chat_sessions" as any).delete().eq("id", id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
    loadSessions();
  };

  const persistSession = async (
    sessionId: string | null,
    msgs: Message[],
    title?: string
  ): Promise<string> => {
    if (!userId) return sessionId || "";

    if (sessionId) {
      await supabase
        .from("chat_sessions" as any)
        .update({
          messages: msgs as any,
          updated_at: new Date().toISOString(),
          ...(title ? { title } : {}),
        })
        .eq("id", sessionId);
      return sessionId;
    } else {
      const { data } = await supabase
        .from("chat_sessions" as any)
        .insert({
          user_id: userId,
          agent_id: selectedAgentId || null,
          title: title || "Nova conversa",
          messages: msgs as any,
        })
        .select("id")
        .single();
      const newId = (data as any)?.id;
      if (newId) {
        setActiveSessionId(newId);
        loadSessions();
      }
      return newId || "";
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedAgentId || isLoading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-playground", {
        body: {
          agent_id: selectedAgentId,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        role: "assistant",
        content: data?.content || "Sem resposta.",
      };
      const allMessages = [...updatedMessages, assistantMsg];
      setMessages(allMessages);

      // Auto-title from first user message
      const isNew = !activeSessionId;
      const title = isNew ? trimmed.substring(0, 60) : undefined;
      const sid = await persistSession(activeSessionId, allMessages, title);
      if (isNew && sid) loadSessions();
      else loadSessions();
    } catch (e: any) {
      console.error("Chat error:", e);
      toast.error("Erro ao processar mensagem");
      const errorMsg: Message = { role: "assistant", content: "Erro ao processar." };
      setMessages([...updatedMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const welcomeMessage = selectedAgent?.welcome_message;

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">
      <ChatSidebar
        sessions={sessions.map((s) => ({ id: s.id, title: s.title, updated_at: s.updated_at }))}
        activeSessionId={activeSessionId}
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectSession={selectSession}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onSelectAgent={(id) => { setSelectedAgentId(id); createNewSession(); }}
      />

      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary/30" />
                {welcomeMessage ? (
                  <div className="text-muted-foreground text-sm">
                    <MarkdownMessage content={welcomeMessage} />
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-foreground mb-1">
                      Chat IA
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedAgent
                        ? `Converse com "${selectedAgent.name}"`
                        : "Selecione um agente para começar"}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "")}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%]",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm"
                        : "text-foreground text-sm"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t bg-background p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedAgent ? "Escreva uma mensagem..." : "Selecione um agente"}
              disabled={!selectedAgentId || isLoading}
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
            />
            <AudioRecordButton
              onTranscript={(text) => setInput((prev) => (prev ? prev + " " : "") + text)}
              disabled={!selectedAgentId || isLoading}
              showEngineSelector
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || !selectedAgentId || isLoading}
              className="shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
