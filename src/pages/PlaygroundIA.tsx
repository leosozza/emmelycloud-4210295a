import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotateCcw, Bot, Send, Loader2, Sparkles, Clock, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Metrics {
  response_time_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AIAgent {
  id: string;
  name: string;
  system_prompt: string;
  ai_provider: string;
  ai_model: string;
  ai_base_url: string | null;
  ai_api_key_credential: string | null;
  temperature: number;
  welcome_message: string | null;
  fallback_message: string | null;
}

interface AIProvider {
  id: string;
  slug: string;
  name: string;
}

export default function PlaygroundIAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAgents();
    loadProviders();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadAgents = async () => {
    const { data } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false });
    if (data) {
      const typed = data as unknown as AIAgent[];
      setAgents(typed);
      if (typed.length > 0) setSelectedAgentId(typed[0].id);
    }
  };

  const loadProviders = async () => {
    const { data } = await supabase
      .from("ai_providers")
      .select("id, slug, name")
      .eq("is_active", true);
    if (data) setProviders(data as AIProvider[]);
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const getProviderName = (slug: string) => {
    const provider = providers.find(p => p.slug === slug);
    return provider?.name || (slug === "lovable" ? "nativo" : slug);
  };

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

      const responseTime = Date.now() - startTime;
      const assistantMsg: Message = {
        role: "assistant",
        content: data?.content || selectedAgent.fallback_message || "Sem resposta.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setMetrics({
        response_time_ms: responseTime,
        prompt_tokens: data?.usage?.prompt_tokens || 0,
        completion_tokens: data?.usage?.completion_tokens || 0,
        total_tokens: data?.usage?.total_tokens || 0,
      });
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
    setMetrics(null);
  };

  return (
    <div>
      <PageHeader
        title="Playground IA"
        description="Teste os agentes de IA em tempo real antes de os conectar aos canais"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ height: "calc(100vh - 14rem)" }}>
        {/* Settings Panel */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-4">
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
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Provider</p>
                  <Badge variant="outline" className="text-[10px]">{getProviderName(selectedAgent.ai_provider)}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Modelo</p>
                  <Badge variant="secondary" className="text-[10px]">{selectedAgent.ai_model}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Temperatura</p>
                  <p className="text-sm font-mono">{selectedAgent.temperature}</p>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={showDebug} onCheckedChange={setShowDebug} />
              <Label className="text-xs">Debug Panel</Label>
            </div>

            {showDebug && metrics && (
              <div className="space-y-2 p-3 bg-muted rounded-lg">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Métricas</p>
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3 w-3" />
                  <span>{metrics.response_time_ms}ms</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Hash className="h-3 w-3" />
                  <span>{metrics.total_tokens} tokens ({metrics.prompt_tokens}↑ {metrics.completion_tokens}↓)</span>
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full" onClick={resetChat}>
              <RotateCcw className="h-3 w-3 mr-1" /> Limpar Chat
            </Button>
          </CardContent>
        </Card>

        {/* Chat Panel */}
        <Card className="lg:col-span-3 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && selectedAgent && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Teste o agente "{selectedAgent.name}"</p>
                  <p className="text-xs mt-1">Envie uma mensagem para iniciar a conversa</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
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
                placeholder={selectedAgent ? "Escrever mensagem..." : "Selecione um agente"}
                disabled={!selectedAgent || isLoading}
                className="flex-1"
              />
              <Button size="icon" onClick={handleSend} disabled={!input.trim() || !selectedAgent || isLoading}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
