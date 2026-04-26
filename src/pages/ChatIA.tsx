import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Sparkles, Square, AlertTriangle, Bot, BookOpen, Menu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AudioRecordButton } from "@/components/chat/AudioRecordButton";
import { useVirtualizer } from "@tanstack/react-virtual";
import { buildChatVirtualItems } from "@/lib/chatLayout";
import { useCanvasAutoResize } from "@/hooks/useCanvasAutoResize";
import { useIsMobile } from "@/hooks/use-mobile";


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
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const [modelHealth, setModelHealth] = useState<{ status: "ok" | "unavailable" | "unknown"; error?: string; alternatives: { name: string; label: string }[] }>({ status: "unknown", alternatives: [] });
  const [switchingModel, setSwitchingModel] = useState(false);
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

  // Verifica saúde do modelo do agente seleccionado (cross-ref com benchmarks)
  useEffect(() => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent?.ai_model || agent.ai_provider === "lovable") {
      setModelHealth({ status: "ok", alternatives: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      // Estado actual deste modelo
      const { data: thisRow } = await supabase
        .from("ollama_model_benchmarks")
        .select("recommendation, error_message")
        .eq("model_name", agent.ai_model)
        .maybeSingle();

      // Alternativas saudáveis (mesmo provider, com recommendation útil)
      const { data: healthy } = await supabase
        .from("ollama_model_benchmarks")
        .select("model_name, recommendation, tokens_per_second")
        .eq("provider_slug", agent.ai_provider)
        .neq("recommendation", "Indisponível")
        .not("tokens_per_second", "is", null)
        .order("tokens_per_second", { ascending: false })
        .limit(3);

      const alternatives = (healthy || [])
        .filter((h: any) => h.model_name !== agent.ai_model)
        .map((h: any) => ({ name: h.model_name, label: h.recommendation || h.model_name }));

      if (cancelled) return;

      if (thisRow?.recommendation === "Indisponível") {
        setModelHealth({ status: "unavailable", error: thisRow.error_message || undefined, alternatives });
      } else {
        setModelHealth({ status: "ok", alternatives });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAgentId, agents]);

  const switchToModel = async (newModel: string) => {
    if (!selectedAgentId) return;
    setSwitchingModel(true);
    try {
      const { error } = await supabase
        .from("ai_agents")
        .update({ ai_model: newModel })
        .eq("id", selectedAgentId);
      if (error) throw error;
      setAgents((prev) => prev.map((a) => (a.id === selectedAgentId ? { ...a, ai_model: newModel } : a)));
      toast.success(`Modelo trocado para ${newModel}`);
    } catch (e: any) {
      toast.error(`Falha ao trocar modelo: ${e.message}`);
    } finally {
      setSwitchingModel(false);
    }
  };

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

  const sidebarComponent = (
    <ChatSidebar
      sessions={sessions.map((s) => ({ id: s.id, title: s.title, updated_at: s.updated_at }))}
      activeSessionId={activeSessionId}
      agents={agents}
      selectedAgentId={selectedAgentId}
      onSelectSession={(id) => { selectSession(id); if (isMobile) setSidebarOpen(false); }}
      onNewSession={() => { createNewSession(); if (isMobile) setSidebarOpen(false); }}
      onDeleteSession={deleteSession}
      onSelectAgent={(id) => { setSelectedAgentId(id); createNewSession(); if (isMobile) setSidebarOpen(false); }}
    />
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-5rem)] -m-3 sm:-m-4 md:-m-6">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        {sidebarComponent}
      </div>

      {/* Mobile sidebar (drawer) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
          {sidebarComponent}
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with menu trigger */}
        <div className="md:hidden border-b bg-background flex items-center gap-2 px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 -ml-1"
            aria-label="Conversas"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium truncate flex-1">
            {selectedAgent?.name || "Chat IA"}
          </span>
          <Button size="sm" variant="outline" onClick={() => { createNewSession(); }} className="h-8 text-xs">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Novo
          </Button>
        </div>

        {/* Model info bar */}
        {selectedAgent?.ai_model && (
          <div className="border-b bg-muted/30 px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Bot className="h-3 w-3" />
            <span className="font-mono">{selectedAgent.ai_model}</span>
            {selectedAgent.ai_provider && selectedAgent.ai_provider !== "lovable" && (
              <span className="text-muted-foreground/60">· {selectedAgent.ai_provider}</span>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 cursor-help",
                      knowledgeStats.docs > 0
                        ? "text-emerald-600 border-emerald-500/40"
                        : "text-muted-foreground/60 border-muted-foreground/20"
                    )}
                  >
                    <BookOpen className="h-3 w-3" />
                    {knowledgeStats.docs > 0
                      ? `${knowledgeStats.docs} docs · ${knowledgeStats.chunks} chunks`
                      : "Sem conhecimento"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  {knowledgeStats.docs > 0 ? (
                    <div className="space-y-1">
                      <p className="font-medium">Conhecimento ativo (RAG)</p>
                      <p className="text-xs text-muted-foreground">
                        O agente responde como especialista, ancorado nestes documentos.
                      </p>
                      {knowledgeStats.collections.length > 0 && (
                        <ul className="text-xs list-disc list-inside mt-1">
                          {knowledgeStats.collections.slice(0, 5).map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                          {knowledgeStats.collections.length > 5 && (
                            <li>+{knowledgeStats.collections.length - 5} outras…</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs">Este agente não tem documentos de treino vinculados — responde como modelo generalista.</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
              className="max-w-3xl mx-auto py-4 sm:py-6 px-3 sm:px-4"
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

        {/* Aviso informativo: modelo grande pode demorar a aquecer (1ª utilização) */}
        {modelHealth.status === "unavailable" && (
          <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-2">
            <div className="max-w-3xl mx-auto flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-xs">
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Modelo pesado: <span className="font-mono">{selectedAgent?.ai_model}</span>
                </span>
                <span className="text-muted-foreground ml-2">
                  pode demorar 1–3 min a aquecer na 1ª utilização. Será carregado automaticamente quando enviares a mensagem.
                </span>
                {modelHealth.alternatives.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-muted-foreground">Alternativas mais rápidas:</span>
                    {modelHealth.alternatives.slice(0, 2).map((alt) => (
                      <Button
                        key={alt.name}
                        size="sm"
                        variant="ghost"
                        disabled={switchingModel}
                        onClick={() => switchToModel(alt.name)}
                        className="h-6 text-xs px-2"
                      >
                        {switchingModel ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        <span className="font-mono">{alt.name}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t bg-background p-2 sm:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto flex gap-1.5 sm:gap-2 items-end">
            <Textarea
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={selectedAgent ? "Escreva uma mensagem..." : "Selecione um agente"}
              disabled={!selectedAgentId || isLoading}
              className="min-h-[44px] max-h-32 resize-none text-base sm:text-sm"
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
                className="shrink-0 h-11 w-11"
                title="Parar geração"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || !selectedAgentId}
                className="shrink-0 h-11 w-11"
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
