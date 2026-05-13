// ledger-update: gera/atualiza o conversation_ledger com resumo + factos coletados.
// Chamado: (1) sob demanda pelo frontend, (2) periodicamente pelo flow-engine
// quando o nº de mensagens novas desde último resumo >= 10.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `Você analisa uma conversa de atendimento jurídico e devolve um JSON ESTRITO com:
{
  "summary": "resumo curto (max 400 chars) em pt-PT do estado atual",
  "open_intents": ["intencao1","intencao2"],
  "collected_facts": { "nome":"...","area_juridica":"...","valor_causa":"...","urgencia":"...","cidade":"..." },
  "blockers": ["falta_documento_x", "aguardando_resposta_cliente"],
  "next_action": "frase curta com a próxima ação recomendada"
}
Só inclua factos comprovados pela conversa. Use null para campos sem evidência. Não invente.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { conversation_id, force = false } = await req.json();
    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Carrega últimas 50 mensagens
    const { data: msgs, error: msgsErr } = await admin
      .from("messages")
      .select("direction, sender_name, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (msgsErr) throw msgsErr;

    if (!msgs || msgs.length === 0) {
      return new Response(JSON.stringify({ skipped: "no messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega ledger atual (se existir)
    const { data: existing } = await admin
      .from("conversation_ledger")
      .select("message_count_at_summary")
      .eq("conversation_id", conversation_id)
      .maybeSingle();

    const totalMsgs = msgs.length;
    const lastCount = existing?.message_count_at_summary || 0;
    if (!force && totalMsgs - lastCount < 10) {
      return new Response(JSON.stringify({ skipped: "below threshold", totalMsgs, lastCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Monta transcrição (ordem cronológica)
    const transcript = msgs.reverse().map((m: any) =>
      `[${m.direction === "inbound" ? "Cliente" : (m.sender_name || "Atendente")}] ${m.content || ""}`
    ).join("\n");

    // Chama LLM
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Conversa:\n${transcript}\n\nDevolva apenas o JSON.` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "ai_gateway_error", status: aiRes.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    let parsed: any = {};
    try {
      parsed = JSON.parse(aiJson.choices[0].message.content);
    } catch (e) {
      console.error("parse error", e);
      parsed = {};
    }

    // Upsert ledger
    const { error: upErr } = await admin.from("conversation_ledger").upsert({
      conversation_id,
      summary: parsed.summary || null,
      open_intents: parsed.open_intents || [],
      collected_facts: parsed.collected_facts || {},
      blockers: parsed.blockers || [],
      next_action: parsed.next_action || null,
      message_count_at_summary: totalMsgs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "conversation_id" });

    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, ledger: parsed, message_count: totalMsgs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ledger-update error:", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
