import { useState, useEffect, useRef, forwardRef } from "react";
import { Node, Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Play, 
  RotateCcw, 
  Send, 
  Bot, 
  User, 
  Pause,
  FastForward,
  ChevronRight,
} from "lucide-react";
import { FlowNodeData } from "./FlowNodeTypes";

interface SimulatorMessage {
  id: string;
  type: "bot" | "user" | "system";
  content: string;
  buttons?: Array<{ id: string; text: string }>;
  pollOptions?: Array<{ id: string; text: string }>;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: Date;
}

interface ExecutionLog {
  nodeId: string;
  nodeType: string;
  label: string;
  timestamp: Date;
  result?: string;
}

interface FlowTestSimulatorProps {
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  onHighlightNode: (nodeId: string | null) => void;
}

export const FlowTestSimulator = forwardRef<HTMLDivElement, FlowTestSimulatorProps>(function FlowTestSimulator(
  {
    nodes,
    edges,
    onClose,
    onHighlightNode,
  }: FlowTestSimulatorProps,
  ref
) {
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [executionLog, setExecutionLog] = useState<ExecutionLog[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({
    "contact.name": "João Silva",
    "contact.phone": "5511999887766",
  });
  const [showLogs, setShowLogs] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const executionQueue = useRef<string[]>([]);
  const isPausedRef = useRef(false);
  const currentNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    currentNodeIdRef.current = currentNodeId;
  }, [currentNodeId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getNextNodes = (nodeId: string, buttonId?: string): string[] => {
    const relevantEdges = edges.filter(e => {
      if (e.source !== nodeId) return false;
      if (buttonId && e.sourceHandle) {
        return e.sourceHandle === buttonId || e.sourceHandle === `btn-${buttonId}`;
      }
      return true;
    });
    return relevantEdges.map(e => e.target);
  };

  const findNodeById = (id: string): Node | undefined => {
    return nodes.find(n => n.id === id);
  };

  const replaceVariables = (text: string): string => {
    let result = text;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return result;
  };

  const executeNode = async (nodeId: string) => {
    if (isPausedRef.current) return;
    
    const node = findNodeById(nodeId);
    if (!node) return;

    const data = node.data as unknown as FlowNodeData;
    currentNodeIdRef.current = nodeId;
    setCurrentNodeId(nodeId);
    onHighlightNode(nodeId);

    // Add to execution log
    setExecutionLog(prev => [...prev, {
      nodeId,
      nodeType: data.nodeType || "unknown",
      label: data.label || "Sem nome",
      timestamp: new Date(),
    }]);

    // Delay for visual effect
    await new Promise(resolve => setTimeout(resolve, 500));

    const nt = data.nodeType as string;
    switch (nt) {
      case "trigger":
        // Just proceed to next node
        break;

      case "message":
        if (data.message) {
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: "bot",
            content: replaceVariables(data.message),
            timestamp: new Date(),
          }]);
        }
        break;

      case "message_buttons":
        if (data.message) {
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: "bot",
            content: replaceVariables(data.message),
            buttons: data.buttons?.map(b => ({ id: b.id, text: b.label })),
            timestamp: new Date(),
          }]);
        }
        if (data.buttons?.length) {
          setWaitingForInput(true);
          return; // Wait for button click
        }
        break;

      case "media":
        if (data.mediaUrl) {
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: "bot",
            content: data.message ? replaceVariables(data.message) : `📎 ${data.mediaType || "image"}`,
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType || "image",
            timestamp: new Date(),
          }]);
        }
        break;

      case "message_list":
        if (data.message) {
          const listItems: Array<{ id: string; text: string }> = [];
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: "bot",
            content: replaceVariables(data.message),
            buttons: listItems,
            timestamp: new Date(),
          }]);
          if (listItems.length) {
            setWaitingForInput(true);
            return;
          }
        }
        break;

      case "wait_reply":
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: "⏳ Aguardando resposta do usuário...",
          timestamp: new Date(),
        }]);
        setWaitingForInput(true);
        return; // Wait for user input

      case "delay": {
        const delaySeconds = data.delay || 1;
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: `⏱️ Aguardando ${delaySeconds}s...`,
          timestamp: new Date(),
        }]);
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        break;
      }

      case "set_variable":
        if (data.variable?.name) {
          setVariables(prev => ({
            ...prev,
            [data.variable!.name]: replaceVariables(data.variable!.value || ""),
          }));
          setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            type: "system",
            content: `📝 Variável definida: ${data.variable.name} = "${data.variable.value}"`,
            timestamp: new Date(),
          }]);
        }
        break;

      case "transfer_to_human":
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: `🔄 Transferindo para humano${data.department ? ` (${data.department})` : ""}...`,
          timestamp: new Date(),
        }]);
        if (data.transferMessage) {
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            type: "bot",
            content: replaceVariables(data.transferMessage),
            timestamp: new Date(),
          }]);
        }
        break;

      case "ai_response":
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: "🤖 IA processando resposta...",
          timestamp: new Date(),
        }]);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: "bot",
          content: "[Resposta simulada da IA] Olá! Como posso ajudá-lo hoje?",
          timestamp: new Date(),
        }]);
        break;

      case "webhook_call":
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: `🌐 Webhook: ${data.webhook?.method || "POST"} ${data.webhook?.url || "(sem URL)"} (simulação)`,
          timestamp: new Date(),
        }]);
        break;

      case "end":
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: "✅ Fluxo finalizado",
          timestamp: new Date(),
        }]);
        setIsRunning(false);
        onHighlightNode(null);
        return;

      default:
        // Bitrix24 nodes, ai_intention, ai_action, ai_router, switch, condition, etc.
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: `📊 [${nt}] ${data.label || nt} executado (simulação)`,
          timestamp: new Date(),
        }]);
        break;
    }

    // Get next nodes and continue
    const nextNodeIds = getNextNodes(nodeId);
    for (const nextId of nextNodeIds) {
      await executeNode(nextId);
    }
  };

  const startSimulation = async () => {
    setMessages([]);
    setExecutionLog([]);
    setVariables({
      "contact.name": "João Silva",
      "contact.phone": "5511999887766",
    });
    setIsRunning(true);
    isPausedRef.current = false;
    setIsPaused(false);
    setWaitingForInput(false);

    // Find trigger node
    const triggerNode = nodes.find(n => ((n.data as unknown as FlowNodeData).nodeType as string) === "trigger");
    if (!triggerNode) {
      setMessages([{
        id: "no-trigger",
        type: "system",
        content: "⚠️ Não encontrei o bloco Trigger no fluxo. Adicione/conecte um Trigger para testar.",
        timestamp: new Date(),
      }]);
      setIsRunning(false);
      onHighlightNode(null);
      return;
    }

    if (triggerNode) {
      setMessages([{
        id: "start",
        type: "system",
        content: "🚀 Simulação iniciada",
        timestamp: new Date(),
      }]);
      await executeNode(triggerNode.id);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: "user",
      content: userMessage,
      timestamp: new Date(),
    }]);

    setVariables(prev => ({
      ...prev,
      "last_response": userMessage,
    }));

    setWaitingForInput(false);

    // Continue from current node
    const fromNodeId = currentNodeIdRef.current;
    if (fromNodeId) {
      const nextNodeIds = getNextNodes(fromNodeId);
      if (nextNodeIds.length === 0) {
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          type: "system",
          content: "⚠️ Não há conexão de saída para continuar a partir deste bloco.",
          timestamp: new Date(),
        }]);
        setIsRunning(false);
        onHighlightNode(null);
        return;
      }
      for (const nextId of nextNodeIds) {
        await executeNode(nextId);
      }
    }
  };

  const handleButtonClick = async (buttonId: string, buttonText: string) => {
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: "user",
      content: buttonText,
      timestamp: new Date(),
    }]);

    setVariables(prev => ({
      ...prev,
      "last_response": buttonText,
      "button_clicked": buttonId,
    }));

    setWaitingForInput(false);

    // Find next node based on button
    const fromNodeId = currentNodeIdRef.current;
    if (fromNodeId) {
      const nextNodeIds = getNextNodes(fromNodeId, buttonId);
      if (nextNodeIds.length === 0) {
        // If no specific edge for button, use default
        const defaultNextIds = getNextNodes(fromNodeId);
        if (defaultNextIds.length === 0) {
          setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            type: "system",
            content: "⚠️ Esse botão não está conectado a nenhum outro bloco.",
            timestamp: new Date(),
          }]);
          setIsRunning(false);
          onHighlightNode(null);
          return;
        }
        for (const nextId of defaultNextIds) {
          await executeNode(nextId);
        }
      } else {
        for (const nextId of nextNodeIds) {
          await executeNode(nextId);
        }
      }
    }
  };

  return (
    <div ref={ref} className="w-96 border-l border-border bg-card h-full flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <span className="font-medium">Simulador de Teste</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Controls */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Button 
          size="sm" 
          onClick={startSimulation} 
          disabled={isRunning && !isPaused}
          className="gap-1"
        >
          {isRunning ? <RotateCcw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {isRunning ? "Reiniciar" : "Iniciar"}
        </Button>
        
        {isRunning && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsPaused(!isPaused)}
            className="gap-1"
          >
            {isPaused ? <FastForward className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {isPaused ? "Continuar" : "Pausar"}
          </Button>
        )}

        <div className="flex-1" />

        <Button
          size="sm"
          variant={showLogs ? "secondary" : "ghost"}
          onClick={() => setShowLogs(!showLogs)}
        >
          Logs
        </Button>
      </div>

      {/* Variables Display */}
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex flex-wrap gap-1">
          {Object.entries(variables).slice(0, 3).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="text-xs font-mono">
              {key}: {value.substring(0, 15)}{value.length > 15 ? "..." : ""}
            </Badge>
          ))}
          {Object.keys(variables).length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{Object.keys(variables).length - 3}
            </Badge>
          )}
        </div>
      </div>

      {/* Chat / Logs Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showLogs ? (
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {executionLog.map((log, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="outline" className="text-[10px]">
                    {log.nodeType}
                  </Badge>
                  <span className="text-muted-foreground">{log.label}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.type === "system" ? (
                    <div className="text-xs text-center text-muted-foreground py-1">
                      {msg.content}
                    </div>
                  ) : (
                    <div className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] ${
                        msg.type === "user" 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      } rounded-lg px-3 py-2`}>
                        <div className="flex items-center gap-1 mb-1">
                          {msg.type === "bot" ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          <span className="text-[10px] opacity-70">
                            {msg.type === "bot" ? "Bot" : "Você"}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        
                        {/* Media preview */}
                        {msg.mediaUrl && (
                          <div className="mt-2 p-2 bg-background/50 rounded text-xs">
                            📎 {msg.mediaType}: {msg.mediaUrl.substring(0, 30)}...
                          </div>
                        )}
                        
                        {msg.buttons && (
                          <div className="flex flex-col gap-1 mt-2">
                            {msg.buttons.map((btn) => (
                              <Button
                                key={btn.id}
                                size="sm"
                                variant="secondary"
                                className="w-full justify-start text-xs h-7"
                                onClick={() => handleButtonClick(btn.id, btn.text)}
                                disabled={!waitingForInput}
                              >
                                {btn.text}
                              </Button>
                            ))}
                          </div>
                        )}
                        
                        {msg.pollOptions && (
                          <div className="flex flex-col gap-1 mt-2">
                            <span className="text-[10px] text-muted-foreground">📊 Enquete:</span>
                            {msg.pollOptions.map((opt) => (
                              <Button
                                key={opt.id}
                                size="sm"
                                variant="outline"
                                className="w-full justify-start text-xs h-7 border-green-500/30"
                                onClick={() => handleButtonClick(opt.id, opt.text)}
                                disabled={!waitingForInput}
                              >
                                🗳️ {opt.text}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            placeholder={waitingForInput ? "Digite sua resposta..." : "Aguardando..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            disabled={!waitingForInput}
            className="flex-1"
          />
          <Button 
            size="icon" 
            onClick={handleSendMessage}
            disabled={!waitingForInput || !inputValue.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
