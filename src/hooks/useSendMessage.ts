import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Message, Conversation } from "@/types/conversation";
import type { MediaPayload } from "@/components/atendimento/ChatInput";

interface UseSendMessageParams {
  conversation: Conversation | null;
}

interface UseSendMessageCallbacks {
  onOptimisticAdd: (msg: Message) => void;
  onOptimisticRemove: (id: string) => void;
  onOptimisticConfirm: (id: string, content: string) => void;
}

async function getInvokeErrorMessage(error: unknown, fallback: string) {
  const maybeContext = (error as { context?: Response })?.context;

  if (maybeContext) {
    try {
      const payload = await maybeContext.clone().json();
      const message = payload?.error || payload?.details?.error || payload?.message;
      const hint = payload?.hint || payload?.details?.hint;
      if (message && hint) return `${message} ${hint}`;
      if (message) return message;
    } catch {
      // fall back to the SDK error message below
    }
  }

  return error instanceof Error ? error.message : fallback;
}

export function useSendMessage(
  params: UseSendMessageParams,
  callbacks: UseSendMessageCallbacks
) {
  const [sending, setSending] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!params.conversation || !content.trim()) return;
      setSending(true);

      // Optimistic message
      const optimisticMsg: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: params.conversation.id,
        direction: "outbound",
        message_type: "text",
        content,
        is_from_bot: false,
        sender_name: "Atendente",
        delivery_status: "pending",
        created_at: new Date().toISOString(),
      };
      callbacks.onOptimisticAdd(optimisticMsg);

      try {
        const { data, error } = await supabase.functions.invoke("message-send", {
          body: { conversation_id: params.conversation.id, content, sender_name: "Atendente" },
        });
        if (error) {
          callbacks.onOptimisticRemove(optimisticMsg.id);
          toast.error(await getInvokeErrorMessage(error, "Erro ao enviar mensagem"));
          return;
        }
        if (data?.error) throw new Error(data.error);

        setTimeout(() => {
          callbacks.onOptimisticConfirm(optimisticMsg.id, content);
        }, 2000);
      } catch (err) {
        callbacks.onOptimisticRemove(optimisticMsg.id);
        toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem");
      } finally {
        setSending(false);
      }
    },
    [params.conversation, callbacks]
  );

  const sendMedia = useCallback(
    async (media: MediaPayload) => {
      if (!params.conversation) return;
      setSending(true);

      // Optimistic media message
      const optimisticMsg: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: params.conversation.id,
        direction: "outbound",
        message_type: media.type,
        media_type: media.type,
        content: media.type === "audio" ? "🎤 Áudio" : media.fileName || media.type,
        is_from_bot: false,
        sender_name: "Atendente",
        delivery_status: "pending",
        created_at: new Date().toISOString(),
      };
      callbacks.onOptimisticAdd(optimisticMsg);

      // For audio, the bubble renders the player; the file name should NOT be
      // saved as `content` (it would later be shown as a fake transcription).
      const dbContent =
        media.type === "audio"
          ? "🎤 Áudio"
          : media.type === "image"
          ? ""
          : media.fileName || "";

      try {
        const { data, error } = await supabase.functions.invoke("message-send", {
          body: {
            conversation_id: params.conversation.id,
            content: dbContent,
            message_type: media.type,
            media_base64: media.base64,
            media_mime_type: media.mimeType,
            file_name: media.fileName,
          },
        });
        if (error) {
          callbacks.onOptimisticRemove(optimisticMsg.id);
          toast.error(await getInvokeErrorMessage(error, "Erro ao enviar mídia"));
          return;
        }
        if (data?.success === false) {
          callbacks.onOptimisticRemove(optimisticMsg.id);
          toast.error(data.error || "Erro ao enviar mídia");
          return;
        }
        if (data?.error) {
          callbacks.onOptimisticRemove(optimisticMsg.id);
          throw new Error(data.error);
        }
        setTimeout(() => {
          callbacks.onOptimisticConfirm(optimisticMsg.id, optimisticMsg.content || "");
        }, 3000);
      } catch (err) {
        callbacks.onOptimisticRemove(optimisticMsg.id);
        toast.error(err instanceof Error ? err.message : "Erro ao enviar mídia");
      } finally {
        setSending(false);
      }
    },
    [params.conversation, callbacks]
  );

  return { sendMessage, sendMedia, sending };
}
