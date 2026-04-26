import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ConversationList } from "@/components/atendimento/ConversationList";
import { ChatPanel } from "@/components/atendimento/ChatPanel";
import { ContactProfile } from "@/components/atendimento/ContactProfile";
import type { Conversation, Message, QuickReply } from "@/types/conversation";
import type { MediaPayload } from "@/components/atendimento/ChatInput";

const MESSAGES_PAGE_SIZE = 50;

export default function AtendimentoPage() {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Conversations ───────────────────────────────────────────────────────────
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
    staleTime: 30_000,
  });

  // ─── Messages (infinite scroll) ──────────────────────────────────────────────
  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["messages", selectedId],
    enabled: !!selectedId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId!)
        .order("created_at", { ascending: false })
        .range(
          (pageParam as number) * MESSAGES_PAGE_SIZE,
          ((pageParam as number) + 1) * MESSAGES_PAGE_SIZE - 1
        );
      if (error) throw error;
      return (data ?? []).reverse() as unknown as Message[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === MESSAGES_PAGE_SIZE ? allPages.length : undefined,
  });

  const messages: Message[] = messagesData
    ? messagesData.pages.flat().sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    : [];

  // ─── Quick replies ────────────────────────────────────────────────────────────
  const { data: quickReplies = [] } = useQuery<QuickReply[]>({
    queryKey: ["quick_replies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quick_replies").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as QuickReply[];
    },
    staleTime: 60_000,
  });

  // ─── Mark as read when conversation is selected ───────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    supabase
      .from("conversations")
      .update({ unread_count: 0 } as any)
      .eq("id", selectedId)
      .then(() => {
        queryClient.setQueryData<Conversation[]>(["conversations"], (prev) =>
          (prev ?? []).map((c) =>
            c.id === selectedId ? { ...c, unread_count: 0 } : c
          )
        );
      });
  }, [selectedId, queryClient]);

  // ─── Realtime subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    // Clean up previous subscription
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
    }

    const channel = supabase
      .channel(`atendimento-realtime-${selectedId ?? "global"}`)
      // Conversations: optimistic update instead of full refetch
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            queryClient.setQueryData<Conversation[]>(["conversations"], (prev) => {
              const newConv = payload.new as unknown as Conversation;
              if ((prev ?? []).some((c) => c.id === newConv.id)) return prev;
              return [newConv, ...(prev ?? [])];
            });
          } else if (payload.eventType === "UPDATE") {
            queryClient.setQueryData<Conversation[]>(["conversations"], (prev) =>
              (prev ?? []).map((c) =>
                c.id === payload.new.id
                  ? { ...c, ...(payload.new as unknown as Conversation) }
                  : c
              )
            );
          } else {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
          }
        }
      )
      // Messages: only for the selected conversation
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as unknown as Message;
          if (msg.conversation_id === selectedId) {
            queryClient.setQueryData(
              ["messages", selectedId],
              (prev: any) => {
                if (!prev) return prev;
                const allMsgs = prev.pages.flat() as Message[];
                if (allMsgs.some((m) => m.id === msg.id)) return prev;
                const newPages = [...prev.pages];
                newPages[newPages.length - 1] = [
                  ...newPages[newPages.length - 1],
                  msg,
                ];
                return { ...prev, pages: newPages };
              }
            );
          }
        }
      )
      // Delivery status updates
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as unknown as Message;
          if (updated.conversation_id === selectedId) {
            queryClient.setQueryData(
              ["messages", selectedId],
              (prev: any) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  pages: prev.pages.map((page: Message[]) =>
                    page.map((m) =>
                      m.id === updated.id ? { ...m, ...updated } : m
                    )
                  ),
                };
              }
            );
          }
        }
      )
      .subscribe();

    realtimeRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, queryClient]);

  // ─── Close conversation ───────────────────────────────────────────────────────
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

  // ─── Attendance mode change ───────────────────────────────────────────────────
  const handleAttendanceModeChange = useCallback(
    (mode: "ai" | "human") => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (prev) =>
        (prev ?? []).map((c) =>
          c.id === selectedId ? { ...c, attendance_mode: mode } : c
        )
      );
    },
    [selectedId, queryClient]
  );

  const selectedConversation =
    conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div
      className="-m-3 sm:-m-4 md:-m-6 flex bg-background h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-5.5rem)]"
    >
      {/* Left panel — conversation list (hidden on mobile when conversation open) */}
      <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[360px] lg:w-[420px] shrink-0 border-r flex-col`}>
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Center panel — chat (hidden on mobile when no conversation selected) */}
      <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
        <ChatPanel
          conversation={selectedConversation}
          messages={messages}
          quickReplies={quickReplies}
          onBack={() => setSelectedId(undefined)}
          onSendMessage={() => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
          }}
          onSendMedia={(_media: MediaPayload) => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
          }}
          onCloseConversation={() => closeConversation.mutate()}
          onAttendanceModeChange={handleAttendanceModeChange}
          onScrollToTop={() => {
            if (hasNextPage) fetchNextPage();
          }}
        />
      </div>

      {/* Right panel — contact profile (only on desktop) */}
      <div className="hidden lg:block">
        <ContactProfile conversation={selectedConversation} />
      </div>
    </div>
  );
}
