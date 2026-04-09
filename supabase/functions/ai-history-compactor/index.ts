/**
 * AI History Compactor — EmmelyCloud
 *
 * Inspirado no compact_messages_if_needed() do Claw Code:
 * - Compacta o histórico de mensagens de uma conversa quando excede o limite
 * - Gera um resumo estruturado das mensagens antigas via LLM
 * - Preserva as N mensagens mais recentes intactas
 * - Salva o resumo na tabela conversation_summaries
 * - Reduz o context window sem perder informação crítica
 *
 * Diferença do Claw Code: aqui a compactação é assíncrona e persistida no banco,
 * enquanto o Claw compacta em memória durante a execução.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECENT_MESSAGES_TO_KEEP = 10;  // Manter as últimas N mensagens intactas
const COMPACT_THRESHOLD = 30;        // Compactar quando tiver mais de N mensagens
const MAX_SUMMARY_TOKENS = 800;      // Tamanho máximo do resumo gerado

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const body = await req.json();
    const { action, conversation_id, force } = body;

    switch (action) {

      // ── Verificar se precisa compactar e compactar se necessário ─────────────
      case "compact_if_needed": {
        if (!conversation_id) {
          return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: jsonHeaders });
        }

        // Contar mensagens da conversa
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversation_id);

        const totalMessages = count || 0;
        const shouldCompact = force || totalMessages > COMPACT_THRESHOLD;

        if (!shouldCompact) {
          return new Response(JSON.stringify({
            compacted: false,
            reason: `Only ${totalMessages} messages (threshold: ${COMPACT_THRESHOLD})`,
            total_messages: totalMessages,
          }), { headers: jsonHeaders });
        }

        // Verificar se já existe resumo recente (< 1 hora)
        const { data: existingSummary } = await supabase
          .from("conversation_summaries")
          .select("id, created_at, summary_text")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSummary && !force) {
          const summaryAge = Date.now() - new Date(existingSummary.created_at).getTime();
          if (summaryAge < 60 * 60 * 1000) { // < 1 hora
            return new Response(JSON.stringify({
              compacted: false,
              reason: "Recent summary already exists",
              summary_id: existingSummary.id,
              total_messages: totalMessages,
            }), { headers: jsonHeaders });
          }
        }

        // Carregar mensagens para compactar (todas exceto as N mais recentes)
        const { data: allMessages } = await supabase
          .from("messages")
          .select("id, direction, content, sender_name, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true });

        if (!allMessages || allMessages.length <= RECENT_MESSAGES_TO_KEEP) {
          return new Response(JSON.stringify({
            compacted: false,
            reason: "Not enough messages to compact",
            total_messages: totalMessages,
          }), { headers: jsonHeaders });
        }

        const messagesToSummarize = allMessages.slice(0, allMessages.length - RECENT_MESSAGES_TO_KEEP);
        const recentMessages = allMessages.slice(-RECENT_MESSAGES_TO_KEEP);

        // Gerar resumo via LLM (inspirado no compact_messages_if_needed do Claw)
        const summaryText = await generateCompactSummary(messagesToSummarize, lovableKey);

        // Salvar resumo na tabela
        const { data: savedSummary, error: saveErr } = await supabase
          .from("conversation_summaries")
          .insert({
            conversation_id,
            summary_text: summaryText,
            messages_summarized: messagesToSummarize.length,
            oldest_message_id: messagesToSummarize[0]?.id,
            newest_summarized_id: messagesToSummarize[messagesToSummarize.length - 1]?.id,
            message_count_at_compaction: totalMessages,
          })
          .select("id")
          .single();

        if (saveErr) {
          console.error("[HISTORY-COMPACTOR] Failed to save summary:", saveErr.message);
          return new Response(JSON.stringify({ error: saveErr.message }), { status: 500, headers: jsonHeaders });
        }

        console.log(`[HISTORY-COMPACTOR] Compacted ${messagesToSummarize.length} messages for conversation ${conversation_id}`);

        return new Response(JSON.stringify({
          compacted: true,
          summary_id: savedSummary.id,
          messages_summarized: messagesToSummarize.length,
          messages_kept: recentMessages.length,
          total_messages: totalMessages,
          summary_preview: summaryText.slice(0, 200) + "...",
        }), { headers: jsonHeaders });
      }

      // ── Obter contexto compactado para o LLM ─────────────────────────────────
      // Retorna: [resumo_antigo] + [mensagens_recentes]
      // Para uso direto no system prompt do ai-process-message
      case "get_compact_context": {
        if (!conversation_id) {
          return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: jsonHeaders });
        }

        // Buscar o resumo mais recente
        const { data: summary } = await supabase
          .from("conversation_summaries")
          .select("summary_text, messages_summarized, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Buscar mensagens recentes
        const { data: recentMessages } = await supabase
          .from("messages")
          .select("direction, content, sender_name, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(RECENT_MESSAGES_TO_KEEP);

        const messages = (recentMessages || []).reverse();

        return new Response(JSON.stringify({
          has_summary: !!summary,
          summary: summary ? {
            text: summary.summary_text,
            messages_summarized: summary.messages_summarized,
            created_at: summary.created_at,
          } : null,
          recent_messages: messages,
          context_prompt: buildContextPrompt(summary, messages),
        }), { headers: jsonHeaders });
      }

      // ── Listar resumos de uma conversa ────────────────────────────────────────
      case "list_summaries": {
        if (!conversation_id) {
          return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: jsonHeaders });
        }

        const { data: summaries } = await supabase
          .from("conversation_summaries")
          .select("id, summary_text, messages_summarized, message_count_at_compaction, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(10);

        return new Response(JSON.stringify({ summaries: summaries || [] }), { headers: jsonHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: jsonHeaders });
    }
  } catch (err) {
    console.error("[HISTORY-COMPACTOR] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});

// ─── Gerar resumo compacto via LLM (inspirado no compact_messages do Claw) ────

async function generateCompactSummary(messages: any[], apiKey: string): Promise<string> {
  if (!apiKey) {
    // Fallback: resumo simples sem LLM
    return buildSimpleSummary(messages);
  }

  const formatted = messages.map(m =>
    `[${m.direction === "inbound" ? "Cliente" : (m.sender_name || "Assistente")}]: ${m.content}`
  ).join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em resumir conversas de atendimento ao cliente.
Crie um resumo ESTRUTURADO e CONCISO da conversa fornecida.

O resumo deve incluir:
1. **Identificação do cliente**: nome, telefone, email (se mencionados)
2. **Assunto principal**: o que o cliente quer/precisa
3. **Área jurídica**: imigração, previdenciário, outro (se aplicável)
4. **Informações coletadas**: dados relevantes fornecidos pelo cliente
5. **Estado atual**: onde a conversa parou, decisões tomadas
6. **Próximos passos**: o que foi prometido ou acordado

Seja objetivo. Máximo ${MAX_SUMMARY_TOKENS} tokens. Use formato markdown.`,
          },
          {
            role: "user",
            content: `Resumir a seguinte conversa (${messages.length} mensagens):\n\n${formatted}`,
          },
        ],
        temperature: 0.1,
        max_tokens: MAX_SUMMARY_TOKENS,
      }),
    });

    if (!res.ok) {
      console.error("[HISTORY-COMPACTOR] LLM error:", res.status);
      return buildSimpleSummary(messages);
    }

    const result = await res.json();
    return result.choices?.[0]?.message?.content || buildSimpleSummary(messages);
  } catch (e) {
    console.error("[HISTORY-COMPACTOR] LLM call failed:", e);
    return buildSimpleSummary(messages);
  }
}

// ─── Fallback: resumo simples sem LLM ─────────────────────────────────────────

function buildSimpleSummary(messages: any[]): string {
  const clientMessages = messages.filter(m => m.direction === "inbound");
  const botMessages = messages.filter(m => m.direction === "outbound");
  const firstDate = messages[0]?.created_at ? new Date(messages[0].created_at).toLocaleDateString("pt-BR") : "desconhecida";
  const lastDate = messages[messages.length - 1]?.created_at ? new Date(messages[messages.length - 1].created_at).toLocaleDateString("pt-BR") : "desconhecida";

  return `## Resumo da Conversa (${messages.length} mensagens)

**Período:** ${firstDate} a ${lastDate}
**Mensagens do cliente:** ${clientMessages.length}
**Respostas do assistente:** ${botMessages.length}

**Últimas mensagens do cliente:**
${clientMessages.slice(-3).map(m => `- "${m.content.slice(0, 100)}"`).join("\n")}

*Resumo gerado automaticamente sem IA (fallback).*`;
}

// ─── Construir prompt de contexto para o LLM ──────────────────────────────────

function buildContextPrompt(summary: any, recentMessages: any[]): string {
  const parts: string[] = [];

  if (summary) {
    parts.push(`## CONTEXTO ANTERIOR DA CONVERSA\n${summary.summary_text}\n\n---`);
  }

  if (recentMessages.length > 0) {
    const formatted = recentMessages.map(m =>
      `[${m.direction === "inbound" ? "Cliente" : (m.sender_name || "Assistente")}]: ${m.content}`
    ).join("\n");
    parts.push(`## MENSAGENS RECENTES\n${formatted}`);
  }

  return parts.join("\n\n");
}
