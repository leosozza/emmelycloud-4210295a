import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, Sparkles, Bot, User, Check, RotateCcw } from "lucide-react";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { toast } from "sonner";
import type { FlowOption, CollectionOption, AIAgent } from "@/pages/Agentes";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentConfig {
  name: string;
  description: string;
  system_prompt: string;
  personality_style: string;
  communication_tone: string;
  agent_type: string;
  temperature: number;
  ai_provider: string;
  ai_model: string;
  welcome_message: string;
  fallback_message: string;
  strategic_objective: string;
  skills: string[];
  governance_mode: string;
  monthly_budget_usd: number | null;
}

interface AgentBuilderChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: AgentConfig) => Promise<void>;
  flows: FlowOption[];
  collections: CollectionOption[];
  agents: AIAgent[];
}

const SKILL_LABELS: Record<string, string> = {
  crm_search: "Pesquisa CRM",
  crm_create: "Criar no CRM",
  payment_create: "Criar Pagamento",
  payment_status: "Status Pagamento",
  flow_trigger: "Executar Fluxo",
  knowledge_search: "Knowledge Base",
  webhook_call: "Webhook/API",
  schedule: "Agendamento",
  navigate_graph: "Grafo Entidades",
  send_email: "Enviar Email",
  generate_document: "Gerar Documento",
};

function extractAgentConfig(text: string): AgentConfig | null {
  const match = text.match(/```agent-config\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function removeConfigBlock(text: string): string {
  return text.replace(/```agent-config\s*\n[\s\S]*?```/, "").trim();
}

export function AgentBuilderChat({ open, onOpenChange, onSave, flows, collections, agents }: AgentBuilderChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [detectedConfig, setDetectedConfig] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setDetectedConfig(null);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);
    setDetectedConfig(null);

    let assistantContent = "";

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-builder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            context: {
              flows: flows.map(f => ({ id: f.id, name: f.name })),
              collections: collections.map(c => ({ collection_name: c.collection_name, doc_count: c.doc_count })),
              existing_agents: agents.map(a => ({ name: a.name, description: a.description })),
            },
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Check for agent config in final content
      const config = extractAgentConfig(assistantContent);
      if (config) {
        setDetectedConfig(config);
        // Update message to remove config block from display
        const cleanContent = removeConfigBlock(assistantContent);
        if (cleanContent) {
          setMessages(prev => prev.map((m, i) => i === prev.length - 1 && m.role === "assistant" ? { ...m, content: cleanContent } : m));
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao comunicar com a IA");
      setMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, flows, collections, agents]);

  const handleSave = async () => {
    if (!detectedConfig) return;
    setSaving(true);
    try {
      await onSave(detectedConfig);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Criar Agente com IA
          </DialogTitle>
          <DialogDescription>
            Descreva o que o agente deve fazer e a IA vai configurá-lo automaticamente.
          </DialogDescription>
        </DialogHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
              <Bot className="h-12 w-12 opacity-40" />
              <div>
                <p className="font-medium">Descreva o agente que deseja criar</p>
                <p className="text-sm mt-1">
                  Ex: "Quero um agente de agendamento que consulta a agenda no Bitrix24 e marca reuniões com os advogados"
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}>
                {msg.role === "assistant" ? (
                  <MarkdownMessage content={msg.content} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Agent Config Proposal */}
          {detectedConfig && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Agente Proposto: {detectedConfig.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{detectedConfig.description}</p>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>{" "}
                    <Badge variant="outline">{detectedConfig.agent_type}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tom:</span>{" "}
                    <Badge variant="outline">{detectedConfig.communication_tone}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Estilo:</span>{" "}
                    <Badge variant="outline">{detectedConfig.personality_style}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Governança:</span>{" "}
                    <Badge variant="outline">{detectedConfig.governance_mode}</Badge>
                  </div>
                </div>

                {detectedConfig.skills?.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Skills:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {detectedConfig.skills.map(s => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {SKILL_LABELS[s] || s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    Criar Agente
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetectedConfig(null);
                      setInput("Quero ajustar: ");
                      inputRef.current?.focus();
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Ajustar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Descreva o agente que deseja criar..."
              className="min-h-[44px] max-h-[120px] resize-none"
              disabled={isStreaming}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="h-[44px] w-[44px] flex-shrink-0"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
