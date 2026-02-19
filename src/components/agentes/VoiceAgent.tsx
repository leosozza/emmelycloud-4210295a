import { useState, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, PhoneOff, Mic, MicOff, Volume2, Loader2, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AIAgent } from "@/pages/Agentes";

interface VoiceAgentProps {
  agent: AIAgent;
}

export function VoiceAgent({ agent }: VoiceAgentProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);

  const conversation = useConversation({
    onConnect: () => {
      toast.success("Conectado ao agente de voz");
    },
    onDisconnect: () => {
      toast.info("Chamada encerrada");
    },
    onMessage: (message: any) => {
      if (message.type === "user_transcript") {
        setTranscript((prev) => [
          ...prev,
          { role: "user", text: message.user_transcription_event?.user_transcript || "" },
        ]);
      } else if (message.type === "agent_response") {
        setTranscript((prev) => [
          ...prev,
          { role: "agent", text: message.agent_response_event?.agent_response || "" },
        ]);
      }
    },
    onError: (error: any) => {
      console.error("Voice agent error:", error);
      toast.error("Erro na conexão de voz");
    },
  });

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    setTranscript([]);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { data, error } = await supabase.functions.invoke(
        "elevenlabs-conversation-token",
        { body: { agent_id: agent.id } }
      );

      if (error || !data?.token) {
        throw new Error(data?.error || error?.message || "Falha ao obter token");
      }

      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });
    } catch (err: any) {
      console.error("Failed to start voice conversation:", err);
      toast.error(err.message || "Falha ao iniciar conversa de voz");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, agent.id]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isConnected = conversation.status === "connected";

  return (
    <Card className="border-accent/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{agent.description || "Agente de voz"}</p>
            </div>
          </div>
          <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px]">
            {isConnected ? "Em chamada" : "Desconectado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status indicators */}
        {isConnected && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {conversation.isSpeaking ? (
                <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
              ) : (
                <Mic className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{conversation.isSpeaking ? "Agente a falar..." : "A ouvir..."}</span>
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border p-3 bg-muted/30">
            {transcript.map((entry, i) => (
              <div key={i} className={`text-xs ${entry.role === "user" ? "text-right" : ""}`}>
                <span className="font-medium text-muted-foreground">
                  {entry.role === "user" ? "Você" : agent.name}:
                </span>{" "}
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!isConnected ? (
            <Button
              onClick={startConversation}
              disabled={isConnecting}
              className="flex-1"
              variant="default"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Phone className="h-4 w-4 mr-2" />
              )}
              {isConnecting ? "Conectando..." : "Iniciar Chamada"}
            </Button>
          ) : (
            <Button
              onClick={stopConversation}
              className="flex-1"
              variant="destructive"
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              Encerrar Chamada
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
