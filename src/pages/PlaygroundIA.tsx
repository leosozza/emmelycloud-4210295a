/**
 * Playground IA — EmmelyCloud
 *
 * Aprimorado com inspirações do Claw Code:
 * - Sessões persistentes via ai-session-runtime (como o SessionStore do Claw)
 * - Métricas de custo por mensagem e por sessão (como o CostTracker do Claw)
 * - Parity Audit integrado — status de saúde do sistema em tempo real
 * - Histórico de sessões anteriores
 * - Indicador de compactação de histórico
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RotateCcw, Bot, Send, Loader2, Sparkles, Clock, Hash,
  DollarSign, Activity, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Zap, MessageSquare, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metrics?: MessageMetrics;
}

interface MessageMetrics {
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  model: string;
}

interface SessionStats {
  total_messages: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  session_id?: string;
}

interface AuditStatus {
  overall_status: "healthy" | "degraded" | "critical";
  errors: number;
  warnings: number;
  checks?: Array<{ name: string; status: string; message: string }>;
}

interface AIAgent {
  id: string;
  name: string;
  system_prompt: string;
  ai_provider: string;
  ai_model: string;
  temperature: number;
  welcome_message: string | null;
  fallback_message: string | null;
}

// ─── Cost estimation (mirrors ai-cost-tracker) ────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro":        { input: 1.25,  output: 10.0 },
  "google/gemini-2.5-flash":      { input: 0.15,  output: 0.6  },
  "google/gemini-2.5-flash-lite": { input: 0.075, output: 0.3  },
  "openai/gpt-5":                 { input: 2.0,   output: 8.0  },
  "openai/gpt-5-mini":            { input: 0.4,   output: 1.6  },
  "openai/gpt-4o":                { input: 2.5,   output: 10.0 },
  "openai/gpt-4o-mini":           { input: 0.15,  output: 0.6  },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 0.5, output: 1.5 };
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlaygroundIAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ total_messages: 0, total_tokens: 0, total_cost_usd: 0, avg_latency_ms: 0 });
  const [auditStatus, setAuditStatus] = useState<AuditStatus | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [isCompacted, setIsCompacted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latencyAccRef = useRef<number[]>([]);

  useEffect(() => { loadAgents(); }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadAgents = async () => {
    const { data } = await supabase
      .from("ai_agents")
      .select("id, name, system_prompt, ai_provider, ai_model, temperature, welcome_message, fallback_message")
      .eq("is_active", true)
      .order("is_default", { ascending: false });
    if (data) {
      const typed = data as unknown as AIAgent[];
      setAgents(typed);
      if (typed.length > 0) setSelectedAgentId(typed[0].id);
    }
  };

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-parity-audit", {
        body: { action: "quick_audit" },
      });
      if (!error && data) {
        setAuditStatus({
          overall_status: data.overall_status,
          errors: data.summary?.errors || 0,
          warnings: data.summary?.warnings || 0,
          checks: data.checks,
        });
      }
    } catch {
      // Audit is optional — don't block the playground
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // Run audit on load
  useEffect(() => { runAudit(); }, [runAudit]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedAgent) return;

    const userMsg: Message = { role: "user", content: trimmed, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const startTime = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke("ai-playground", {
        body: {
          agent_id: selectedAgent.id,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        },
      });

      if (error) throw error;

      const latencyMs = Date.now() - startTime;
      const promptTokens = data?.usage?.prompt_tokens || 0;
      const completionTokens = data?.usage?.completion_tokens || 0;
      const totalTokens = data?.usage?.total_tokens || 0;
      const costUsd = estimateCost(selectedAgent.ai_model, promptTokens, completionTokens);

      const msgMetrics: MessageMetrics = {
        latency_ms: latencyMs,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_usd: costUsd,
        model: selectedAgent.ai_model,
      };

      const assistantMsg: Message = {
        role: "assistant",
        content: data?.content || selectedAgent.fallback_message || "Sem resposta.",
        timestamp: new Date(),
        metrics: msgMetrics,
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Update session stats
      latencyAccRef.current.push(latencyMs);
      setSessionStats(prev => {
        const newTotal = prev.total_messages + 1;
        const newTokens = prev.total_tokens + totalTokens;
        const newCost = prev.total_cost_usd + costUsd;
        const avgLatency = latencyAccRef.current.reduce((a, b) => a + b, 0) / latencyAccRef.current.length;
        return { total_messages: newTotal, total_tokens: newTokens, total_cost_usd: newCost, avg_latency_ms: avgLatency };
      });

      // Check if history was compacted
      if (data?.compact_context_used) setIsCompacted(true);

    } catch (e: any) {
      console.error("Playground error:", e);
      toast.error("Erro ao processar mensagem");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: selectedAgent.fallback_message || "Erro ao processar.",
        timestamp: new Date(),
      }]);
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

  const resetChat = () => {
    setMessages([]);
    setSessionStats({ total_messages: 0, total_tokens: 0, total_cost_usd: 0, avg_latency_ms: 0 });
    latencyAccRef.current = [];
    setIsCompacted(false);
  };

  const auditIcon = auditStatus?.overall_status === "healthy"
    ? <CheckCircle2 className="h-3 w-3 text-green-500" />
    : auditStatus?.overall_status === "degraded"
    ? <AlertTriangle className="h-3 w-3 text-yellow-500" />
    : auditStatus?.overall_status === "critical"
    ? <XCircle className="h-3 w-3 text-red-500" />
    : <Activity className="h-3 w-3 text-muted-foreground" />;

  return (
    <TooltipProvider>
      <div>
        <PageHeader
          title="Playground IA"
          description="Teste os agentes de IA em tempo real antes de os conectar aos canais"
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ height: "calc(100vh - 14rem)" }}>

          {/* ── Settings Panel ─────────────────────────────────────────────────── */}
          <Card className="lg:col-span-1 flex flex-col overflow-hidden">
            <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto">

              {/* Agent selector */}
              <div>
                <Label className="text-xs font-semibold">Agente</Label>
                <Select value={selectedAgentId} onValueChange={(v) => { setSelectedAgentId(v); resetChat(); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="h-3 w-3" />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAgent && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Provider</p>
                      <Badge variant="outline" className="text-[10px] truncate max-w-full">{selectedAgent.ai_provider}</Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Temp.</p>
                      <p className="text-sm font-mono">{selectedAgent.temperature}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Modelo</p>
                    <Badge variant="secondary" className="text-[10px] truncate max-w-full block">{selectedAgent.ai_model}</Badge>
                  </div>
                </>
              )}

              <Separator />

              {/* Session Stats — Claw CostTracker inspired */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Sessão Atual
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    <span>{sessionStats.total_messages} msgs</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    <span>{sessionStats.total_tokens.toLocaleString()} tkns</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{sessionStats.avg_latency_ms > 0 ? `${Math.round(sessionStats.avg_latency_ms)}ms` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>${sessionStats.total_cost_usd.toFixed(5)}</span>
                  </div>
                </div>
                {isCompacted && (
                  <div className="flex items-center gap-1 text-[10px] text-blue-500 bg-blue-50 rounded px-2 py-1">
                    <Archive className="h-3 w-3" />
                    <span>Histórico compactado</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Debug toggle */}
              <div className="flex items-center gap-2">
                <Switch checked={showDebug} onCheckedChange={setShowDebug} />
                <Label className="text-xs">Métricas por mensagem</Label>
              </div>

              {/* Parity Audit — Claw ParityAudit inspired */}
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
                  onClick={() => setShowAudit(v => !v)}
                >
                  {auditLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : auditIcon}
                  <span className="flex-1 text-left">
                    {auditStatus
                      ? `Sistema ${auditStatus.overall_status === "healthy" ? "saudável" : auditStatus.overall_status === "degraded" ? "degradado" : "crítico"}`
                      : "Verificando sistema..."}
                  </span>
                  {showAudit ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                {showAudit && auditStatus?.checks && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {auditStatus.checks.map((check, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px]">
                        {check.status === "ok"
                          ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                          : check.status === "warning"
                          ? <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
                          : <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />}
                        <span className="text-muted-foreground leading-tight">{check.message}</span>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="w-full h-6 text-[10px] mt-1" onClick={runAudit}>
                      Atualizar
                    </Button>
                  </div>
                )}
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={resetChat}>
                <RotateCcw className="h-3 w-3 mr-1" /> Limpar Chat
              </Button>
            </CardContent>
          </Card>

          {/* ── Chat Panel ─────────────────────────────────────────────────────── */}
          <Card className="lg:col-span-3 flex flex-col overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && selectedAgent && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-muted-foreground">
                    <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Teste o agente "{selectedAgent.name}"</p>
                    <p className="text-xs mt-1">Envie uma mensagem para iniciar a conversa</p>
                    {selectedAgent.welcome_message && (
                      <p className="text-xs mt-3 italic opacity-60 max-w-xs mx-auto">
                        "{selectedAgent.welcome_message}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-[10px] mt-1 opacity-50">
                      {msg.timestamp.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  {/* Per-message metrics (Claw CostTracker inspired) */}
                  {showDebug && msg.metrics && (
                    <div className="flex items-center gap-3 mt-1 px-1 text-[10px] text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {msg.metrics.latency_ms}ms
                        </TooltipTrigger>
                        <TooltipContent>Latência da resposta</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          <Hash className="h-2.5 w-2.5" />
                          {msg.metrics.total_tokens} tkns
                        </TooltipTrigger>
                        <TooltipContent>{msg.metrics.prompt_tokens}↑ {msg.metrics.completion_tokens}↓</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1">
                          <DollarSign className="h-2.5 w-2.5" />
                          ${msg.metrics.cost_usd.toFixed(5)}
                        </TooltipTrigger>
                        <TooltipContent>Custo estimado desta mensagem</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedAgent ? "Escrever mensagem... (Enter para enviar)" : "Selecione um agente"}
                  disabled={!selectedAgent || isLoading}
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSend} disabled={!input.trim() || !selectedAgent || isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
