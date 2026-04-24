import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Sparkles, Square, AlertTriangle, Bot, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AudioRecordButton } from "@/components/chat/AudioRecordButton";
import { useVirtualizer } from "@tanstack/react-virtual";
import { buildChatVirtualItems } from "@/lib/chatLayout";
import { useCanvasAutoResize } from "@/hooks/useCanvasAutoResize";

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
  ai_model: string | null;
  ai_provider: string | null;
}

// Detecta se um modelo é "pesado" (provavelmente lento)
function isHeavyModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  // Procura por números de parâmetros >= 14B
  const match = m.match(/(\d+)b/);
  if (match && parseInt(match[1], 10) >= 14) return true;
  // Modelos VL (visão) ou variantes pesadas conhecidas
  if (m.includes("vl") || m.includes("70b") || m.includes("405b")) return true;
  return false;
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
  const [streamElapsed, setStreamElapsed] = useState(0);
  const [hasFirstToken, setHasFirstToken] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState<{ docs: number; chunks: number; collections: string[] }>({ docs: 0, chunks: 0, collections: [] });
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const isHeavy = isHeavyModel(selectedAgent?.ai_model);

  // Carrega contagem de conhecimento vinculado ao agente seleccionado
  useEffect(() => {
    if (!selectedAgentId) {
      setKnowledgeStats({ docs: 0, chunks: 0, collections: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase
        .from("agent_knowledge_documents")
        .select("document_id")
        .eq("agent_id", selectedAgentId);
      const docIds = (links || []).map((l: any) => l.document_id);
      if (docIds.length === 0) {
        if (!cancelled) setKnowledgeStats({ docs: 0, chunks: 0, collections: [] });
        return;
      }
      const [{ count: chunkCount }, { data: docs }] = await Promise.all([
        supabase
          .from("knowledge_chunks")
          .select("id", { count: "exact", head: true })
          .in("document_id", docIds),
        supabase
          .from("knowledge_documents")
          .select("collection_name")
          .in("id", docIds),
      ]);
      const collSet = new Set<string>();
      (docs || []).forEach((d: any) => { if (d.collection_name) collSet.add(d.collection_name); });
      if (!cancelled) setKnowledgeStats({
        docs: docIds.length,
        chunks: chunkCount || 0,
        collections: Array.from(collSet),
      });
    })();
    return () => { cancelled = true; };
  }, [selectedAgentId]);

  // Virtualizer
  const virtualItems = buildChatVirtualItems(messages, scrollRef.current?.clientWidth || 600, isLoading && !hasFirstToken);
  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => virtualItems[i]?.height || 60,
    overscan: 5,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (virtualItems.length > 0) {
      virtualizer.scrollToIndex(virtualItems.length - 1, { align: "end" });
    }
  }, [messages.length, isLoading, hasFirstToken]);

  // Cronómetro durante streaming
  useEffect(() => {
    if (isLoading) {
      setStreamElapsed(0);
      const start = Date.now();
      elapsedTimerRef.current = window.setInterval(() => {
        setStreamElapsed(Math.floor((Date.now() - start) / 1000));
      }, 500);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [isLoading]);

  const handleTextareaInput = useCanvasAutoResize(setInput, 44, 128);

  // Load agents
  useEffect(() => {
    supabase
      .from("ai_agents")
      .select("id, name, welcome_message, ai_model, ai_provider")
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

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
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
    setHasFirstToken(false);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-playground`;
      const accessToken = authSession?.access_token;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          agent_id: selectedAgentId,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          toast.error("Limite de pedidos atingido. Tenta novamente em alguns segundos.");
        } else if (resp.status === 402) {
          toast.error("Créditos esgotados. Adiciona créditos no workspace.");
        } else if (resp.status === 504) {
          toast.error("O modelo demorou demasiado a responder. Tenta um modelo mais leve.");
        } else {
          toast.error(`Erro ${resp.status} ao processar.`);
        }
        throw new Error(`HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error("Sem corpo de resposta");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: rDone, value } = await reader.read();
        if (rDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              if (!hasFirstToken) setHasFirstToken(true);
              upsertAssistant(delta);
            }
          } catch {
            // JSON partido entre chunks — re-buffer
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Flush final
      if (buffer.trim()) {
        for (let raw of buffer.split("\n")) {
          if (!raw || raw.startsWith(":")) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const json = raw.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) upsertAssistant(delta);
          } catch { /* ignore */ }
        }
      }

      // Persistir sessão com mensagem completa
      const finalAssistant: Message = {
        role: "assistant",
        content: assistantSoFar || "Sem resposta.",
      };
      const allMessages = assistantSoFar
        ? [...updatedMessages, finalAssistant]
        : [...updatedMessages, finalAssistant];

      const isNew = !activeSessionId;
      const title = isNew ? trimmed.substring(0, 60) : undefined;
      await persistSession(activeSessionId, allMessages, title);
      loadSessions();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // Cancelado pelo utilizador — manter o que já temos
        if (assistantSoFar) {
          const allMessages = [
            ...updatedMessages,
            { role: "assistant" as const, content: assistantSoFar + "\n\n_[Interrompido]_" },
          ];
          await persistSession(activeSessionId, allMessages, !activeSessionId ? trimmed.substring(0, 60) : undefined);
          loadSessions();
        }
        toast.info("Geração interrompida.");
      } else {
        console.error("Chat error:", e);
        if (!assistantSoFar) {
          setMessages([
            ...updatedMessages,
            { role: "assistant", content: "Erro ao processar." },
          ]);
        }
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      setHasFirstToken(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const welcomeMessage = selectedAgent?.welcome_message;
  const loadingLabel = !hasFirstToken
    ? streamElapsed < 10
      ? "A carregar modelo…"
      : streamElapsed < 30
        ? "A pensar…"
        : "Modelo grande, aguarda…"
    : null;

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
        {/* Model info bar */}
        {selectedAgent?.ai_model && (
          <div className="border-b bg-muted/30 px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-3 w-3" />
            <span className="font-mono">{selectedAgent.ai_model}</span>
            {selectedAgent.ai_provider && selectedAgent.ai_provider !== "lovable" && (
              <span className="text-muted-foreground/60">· {selectedAgent.ai_provider}</span>
            )}
            {isHeavy && (
              <Badge variant="outline" className="ml-auto gap-1 text-amber-600 border-amber-500/40">
                <AlertTriangle className="h-3 w-3" />
                Modelo lento (30-90s)
              </Badge>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 && !isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary/30" />
                {welcomeMessage ? (
                  <div className="text-muted-foreground text-sm">
                    <MarkdownMessage content={welcomeMessage} />
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-foreground mb-1">Chat IA</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedAgent ? `Converse com "${selectedAgent.name}"` : "Selecione um agente para começar"}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className="max-w-3xl mx-auto py-6 px-4"
              style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((vRow) => {
                const item = virtualItems[vRow.index];
                if (item.type === "loading") {
                  return (
                    <div
                      key="loading"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vRow.start}px)`,
                      }}
                      className="flex gap-3 items-center"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      {loadingLabel && (
                        <span className="text-xs text-muted-foreground">
                          {loadingLabel}
                          <span className="ml-2 font-mono">
                            {Math.floor(streamElapsed / 60)}:{(streamElapsed % 60).toString().padStart(2, "0")}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                }
                const msg = messages[item.index];
                return (
                  <div
                    key={vRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vRow.start}px)`,
                    }}
                    className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "")}
                  >
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
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t bg-background p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              value={input}
              onChange={handleTextareaInput}
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
            {isLoading ? (
              <Button
                size="icon"
                variant="destructive"
                onClick={handleStop}
                className="shrink-0 self-end"
                title="Parar geração"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || !selectedAgentId}
                className="shrink-0 self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
