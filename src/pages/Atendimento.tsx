import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ConversationList } from "@/components/atendimento/ConversationList";
import { ChatPanel } from "@/components/atendimento/ChatPanel";
import { ContactProfile } from "@/components/atendimento/ContactProfile";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";
type Status = "aberta" | "em_atendimento" | "aguardando" | "fechada";
type Direction = "inbound" | "outbound";

interface Conversation {
  id: string;
  channel: Channel;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  contact_instagram: string | null;
  contact_avatar_url: string | null;
  client_id: string | null;
  status: Status;
  assigned_to: string | null;
  department: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: Direction;
  content: string;
  sender_name: string | null;
  media_url: string | null;
  media_type: string | null;
  read_at: string | null;
  created_at: string;
  delivery_status: string | null;
}

interface QuickReply {
  id: string;
  title: string;
  content: string;
  category: string | null;
}

export default function AtendimentoPage() {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const queryClient = useQueryClient();

  // Fetch conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  // Fetch messages for selected conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["messages", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Message[];
    },
  });

  // Fetch quick replies
  const { data: quickReplies = [] } = useQuery<QuickReply[]>({
    queryKey: ["quick_replies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quick_replies").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as QuickReply[];
    },
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedId) return;
      const conv = conversations.find((c) => c.id === selectedId);

      // Route Instagram via Meta Graph API, WhatsApp via Callbell
      if (conv?.channel === "instagram") {
        const { data, error } = await supabase.functions.invoke("instagram-send", {
          body: { conversation_id: selectedId, content },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return;
      }

      if (conv?.channel === "whatsapp") {
        const { data, error } = await supabase.functions.invoke("callbell-send", {
          body: { conversation_id: selectedId, content },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return;
      }

      // Default: direct DB insert for other channels
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedId,
        direction: "outbound" as Direction,
        content,
        sender_name: "Atendente",
      } as any);
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: content.slice(0, 100),
        } as any)
        .eq("id", selectedId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Close conversation mutation
  const closeConversation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      await supabase
        .from("conversations")
        .update({ status: "fechada" } as any)
        .eq("id", selectedId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("atendimento-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.conversation_id === selectedId) {
          queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, queryClient]);

  // Poll delivery status for outbound messages
  useEffect(() => {
    if (!selectedId) return;

    const hasPending = messages.some(
      (m) => m.direction === "outbound" && m.delivery_status && m.delivery_status !== "read"
    );
    if (!hasPending) return;

    const pollStatus = async () => {
      try {
        const { data } = await supabase.functions.invoke(
          `callbell-status?conversation_id=${selectedId}`,
          { method: "GET" }
        );
        if (data?.updated?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
        }
      } catch (e) {
        console.error("Status poll error:", e);
      }
    };

    pollStatus(); // Initial poll
    const interval = setInterval(pollStatus, 15000);
    return () => clearInterval(interval);
  }, [selectedId, messages, queryClient]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6 rounded-lg overflow-hidden border">
      {/* Left panel - conversation list */}
      <div className="w-96 shrink-0">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Center panel - chat */}
      <ChatPanel
        conversation={selectedConversation}
        messages={messages}
        quickReplies={quickReplies}
        onSendMessage={(content) => sendMessage.mutate(content)}
        onCloseConversation={() => closeConversation.mutate()}
      />

      {/* Right panel - contact profile */}
      <ContactProfile conversation={selectedConversation} />
    </div>
  );
}
