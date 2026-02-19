import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Send, Loader2, User, Sparkles, RotateCcw, History } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  training_id?: string;
}

interface TrainingHistory {
  id: string;
  instruction: string;
  generated_rule: string;
  applied_at: string;
  reverted_at: string | null;
}

interface AgentTrainingChatProps {
  agentId: string;
  agentName: string;
}

export function AgentTrainingChat({ agentId, agentName }: AgentTrainingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<TrainingHistory[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("persona_training_history" as any)
        .select("id, instruction, generated_rule, applied_at, reverted_at")
        .eq("agent_id", agentId)
        .order("applied_at", { ascending: false })
        .limit(20);

      setHistory((data as unknown as TrainingHistory[]) || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  }, [agentId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const instruction = input;
    setInput("");
    setLoading(true);

    try {
      const { data: previewData, error: previewError } = await supabase.functions.invoke(
        "persona-trainer",
        {
          body: {
            action: "preview",
            agent_id: agentId,
            instruction,
          },
        }
      );

      if (previewError) throw previewError;

      const previewMessage: Message = {
        role: "assistant",
        content: `Entendi! Vou adicionar essa instrução ao comportamento do agente:\n\n✅ **Regra gerada:**\n"${previewData.generated_rule}"\n\nDeseja aplicar essa mudança? Digite "confirmar" para aplicar ou faça uma nova instrução.`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, previewMessage]);

      sessionStorage.setItem(
        `pending_training_${agentId}`,
        JSON.stringify({
          instruction,
          generated_rule: previewData.generated_rule,
        })
      );
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "❌ Erro ao processar a instrução. Tente novamente.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = useCallback(async () => {
    const pending = sessionStorage.getItem(`pending_training_${agentId}`);
    if (!pending) return;

    setLoading(true);
    try {
      const { instruction } = JSON.parse(pending);

      const { data, error } = await supabase.functions.invoke("persona-trainer", {
        body: {
          action: "train",
          agent_id: agentId,
          instruction,
        },
      });

      if (error) throw error;

      const confirmMessage: Message = {
        role: "assistant",
        content: `✅ Treinamento aplicado com sucesso!\n\nO agente "${agentName}" agora seguirá essa nova instrução.\n\n💡 Pode testar no Playground para verificar o comportamento.`,
        timestamp: new Date(),
        training_id: data.training_id,
      };

      setMessages((prev) => [...prev, confirmMessage]);
      sessionStorage.removeItem(`pending_training_${agentId}`);
      fetchHistory();
      toast.success("Treinamento aplicado");
    } catch (error) {
      console.error("Error applying training:", error);
      toast.error("Erro ao aplicar treinamento");
    } finally {
      setLoading(false);
    }
  }, [agentId, agentName, fetchHistory]);

  const handleRevert = async (trainingId: string) => {
    try {
      const { error } = await supabase.functions.invoke("persona-trainer", {
        body: {
          action: "revert",
          agent_id: agentId,
          training_id: trainingId,
        },
      });

      if (error) throw error;

      toast.success("Treinamento revertido");
      fetchHistory();
    } catch (error) {
      console.error("Error reverting:", error);
      toast.error("Erro ao reverter treinamento");
    }
  };

  // Check if user typed "confirmar"
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.role === "user" &&
      lastMessage.content.toLowerCase().trim() === "confirmar"
    ) {
      handleConfirm();
    }
  }, [messages, handleConfirm]);

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Treinar {agentName}
        </CardTitle>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              <History className="h-4 w-4" />
              Histórico
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Histórico de Treinamento</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-100px)] mt-4">
              <div className="space-y-3">
                {history.map((h) => (
                  <Card key={h.id}>
                    <CardContent className="py-3">
                      <p className="text-sm font-medium mb-1">{h.instruction}</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {h.generated_rule}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.applied_at).toLocaleDateString("pt-PT")}
                        </span>
                        {h.reverted_at ? (
                          <Badge variant="outline">Revertido</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevert(h.id)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reverter
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {history.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum treinamento realizado
                  </p>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        <ScrollArea className="flex-1 px-4">
          {messages.length === 0 ? (
            <div className="py-8 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Ensine novas regras ao agente usando linguagem natural.
              </p>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Exemplos:</p>
                <div className="space-y-1">
                  {[
                    "Quando perguntarem sobre preços, ofereça 10% de desconto",
                    "Nunca mencione concorrentes",
                    "Sempre pergunte o nome do cliente no início",
                    "Se o cliente parecer frustrado, encaminhe para um humano",
                  ].map((example, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1.5 w-full justify-start"
                      onClick={() => setInput(example)}
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-secondary">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ensine uma nova regra..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
