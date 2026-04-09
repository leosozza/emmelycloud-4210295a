import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Supabase client ───────────────────────────────────────────────────────
function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── Resolve AI provider dynamically from ai_agents (default agent) ─────────
// Corrige Bug #2: remove modelo hardcoded, usa o agente padrão configurado.
async function resolveAIConfig(supabase: any): Promise<{
  apiUrl: string;
  apiKey: string;
  model: string;
  headers: Record<string, string>;
}> {
  // 1. Tentar carregar o agente padrão
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("ai_provider, ai_model, ai_base_url, ai_api_key_credential")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  const provider = agent?.ai_provider || "lovable";
  const model = agent?.ai_model || "google/gemini-2.5-flash";

  // 2. Resolver URL e chave de API com base no provedor
  if (provider === "lovable") {
    const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    return {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey,
      model,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    };
  }

  // 3. Provedor customizado — buscar na tabela ai_providers e integration_credentials
  const { data: providerRow } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("slug", provider)
    .single();

  let apiUrl = agent?.ai_base_url || providerRow?.base_url || "";
  let apiKey = "";

  // Resolver URL base (ex: Ollama)
  if (providerRow?.credential_key === "base_url" || !providerRow?.auth_header) {
    const { data: urlOverride } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", provider)
      .eq("credential_key", "OLLAMA_BASE_URL")
      .single();
    if (urlOverride?.credential_value) {
      let base = urlOverride.credential_value.replace(/\/+$/, "");
      if (!base.endsWith("/v1/chat/completions")) base += "/v1/chat/completions";
      apiUrl = base;
    }
  }

  // Resolver chave de API
  const credKey = agent?.ai_api_key_credential ||
    (providerRow?.credential_key !== "base_url" ? providerRow?.credential_key : null);
  if (credKey) {
    const { data: cred } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", provider)
      .eq("credential_key", credKey)
      .single();
    apiKey = cred?.credential_value || "";
  }

  const authHeader = providerRow?.auth_header || "Authorization";
  const authPrefix = providerRow?.auth_prefix || "Bearer";
  return {
    apiUrl,
    apiKey,
    model,
    headers: {
      "Content-Type": "application/json",
      [authHeader]: `${authPrefix} ${apiKey}`.trim(),
    },
  };
}

// ─── Chamada genérica ao LLM ─────────────────────────────────────────────────
async function callAI(
  config: { apiUrl: string; headers: Record<string, string>; model: string },
  messages: any[],
  tools?: any[],
  toolChoice?: any,
  temperature = 0.3
) {
  const body: any = { model: config.model, messages, temperature };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const status = response.status;
    const errText = await response.text();
    console.error("[AI-AUTOMATION] Gateway error:", status, errText);
    if (status === 429) throw { status: 429, message: "Rate limit exceeded, tente novamente em breve." };
    if (status === 402) throw { status: 402, message: "Créditos insuficientes. Adicione créditos ao workspace." };
    throw { status: 500, message: `AI gateway error: ${status}` };
  }

  return response.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fetchConversationMessages(supabase: any, conversationId: string, limit = 50) {
  const { data: messages } = await supabase
    .from("messages")
    .select("content, direction, sender_name, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return messages || [];
}

function formatMessages(messages: any[]): string {
  return messages
    .map((m: any) => `[${m.direction === "inbound" ? m.sender_name || "Cliente" : "Atendente"}]: ${m.content}`)
    .join("\n");
}

// ─── ACTION: classify_lead ────────────────────────────────────────────────────
async function classifyLead(supabase: any, config: any, leadId: string) {
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (error || !lead) throw { status: 404, message: "Lead not found" };

  let conversationContext = "";
  if (lead.conversation_id) {
    const msgs = await fetchConversationMessages(supabase, lead.conversation_id, 30);
    if (msgs.length > 0) conversationContext = "\n\nHISTÓRICO DA CONVERSA:\n" + formatMessages(msgs);
  }

  const legalAreas = ["previdencia", "cidadania", "vistos", "trabalhista", "familia", "empresarial", "tributario", "outro"];

  const systemPrompt = `Você é um assistente jurídico especializado em triagem de leads para um escritório de advocacia em Portugal.
Analise os dados do lead e classifique-o usando tool calling. Seja preciso e objetivo.

Critérios de classificação:
- legal_area: a área jurídica mais provável
- urgency: "normal" (prazo flexível), "alta" (necessita atenção em dias), "critica" (ação imediata necessária)
- ai_score: de 0 a 100, probabilidade de conversão/viabilidade
- ai_viability: "alta", "media", "baixa", ou "pendente"
- notes: resumo conciso da análise (máximo 2 frases)`;

  const userPrompt = `DADOS DO LEAD:
- Nome: ${lead.name}
- Email: ${lead.email || "não informado"}
- Telefone: ${lead.phone || "não informado"}
- País: ${lead.country || "não informado"}
- Origem: ${lead.origin}
- Área jurídica atual: ${lead.legal_area || "não classificado"}
- Urgência atual: ${lead.urgency || "não classificada"}
- Notas existentes: ${lead.notes || "nenhuma"}
${conversationContext}`;

  const result = await callAI(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], [{
    type: "function",
    function: {
      name: "classify_lead",
      description: "Classify a lead with legal area, urgency, viability score, and analysis notes",
      parameters: {
        type: "object",
        properties: {
          legal_area: { type: "string", enum: legalAreas },
          urgency: { type: "string", enum: ["normal", "alta", "critica"] },
          ai_score: { type: "number", description: "Score from 0 to 100" },
          ai_viability: { type: "string", enum: ["alta", "media", "baixa", "pendente"] },
          notes: { type: "string", description: "Brief analysis (max 2 sentences)" },
        },
        required: ["legal_area", "urgency", "ai_score", "ai_viability", "notes"],
        additionalProperties: false,
      },
    },
  }], { type: "function", function: { name: "classify_lead" } });

  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw { status: 500, message: "AI did not return classification" };

  const classification = JSON.parse(toolCall.function.arguments);
  classification.ai_score = Math.max(0, Math.min(100, Math.round(classification.ai_score)));

  const { error: updateErr } = await supabase.from("leads").update({
    legal_area: classification.legal_area,
    urgency: classification.urgency,
    ai_score: classification.ai_score,
    ai_viability: classification.ai_viability,
    notes: classification.notes,
  }).eq("id", leadId);

  if (updateErr) console.error("[AI-AUTOMATION] Lead update error:", updateErr);

  return { success: true, classification, model_used: config.model };
}

// ─── ACTION: summarize_conversation ──────────────────────────────────────────
async function summarizeConversation(supabase: any, config: any, conversationId: string) {
  const msgs = await fetchConversationMessages(supabase, conversationId, 80);
  if (msgs.length === 0) throw { status: 400, message: "Conversa sem mensagens" };

  const formatted = formatMessages(msgs);

  const result = await callAI(config, [
    { role: "system", content: `Você é um assistente jurídico. Resuma a conversa de forma concisa e profissional em português de Portugal.
Inclua: assunto principal, pedidos do cliente, informações relevantes extraídas, e estado atual. Máximo 4 frases.` },
    { role: "user", content: `Resuma esta conversa:\n\n${formatted}` },
  ]);

  const summary = result.choices?.[0]?.message?.content || "Resumo indisponível";

  // Salvar resumo no lead vinculado
  const { data: lead } = await supabase
    .from("leads")
    .select("id, notes")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (lead) {
    const updatedNotes = lead.notes
      ? `${lead.notes}\n\n--- Resumo IA (${new Date().toLocaleDateString("pt-PT")}) ---\n${summary}`
      : `--- Resumo IA (${new Date().toLocaleDateString("pt-PT")}) ---\n${summary}`;
    await supabase.from("leads").update({ notes: updatedNotes }).eq("id", lead.id);
  }

  return { success: true, summary, lead_updated: !!lead, model_used: config.model };
}

// ─── ACTION: suggest_next_action ─────────────────────────────────────────────
async function suggestNextAction(supabase: any, config: any, leadId: string) {
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (error || !lead) throw { status: 404, message: "Lead not found" };

  let caseInfo = "";
  const { data: caso } = await supabase.from("cases").select("*").eq("lead_id", leadId).maybeSingle();
  if (caso) caseInfo = `\nCASO: ${caso.title} | Status: ${caso.status} | Viabilidade: ${caso.viability || "pendente"}`;

  let conversationContext = "";
  if (lead.conversation_id) {
    const msgs = await fetchConversationMessages(supabase, lead.conversation_id, 20);
    if (msgs.length > 0) conversationContext = "\n\nÚLTIMAS MENSAGENS:\n" + formatMessages(msgs);
  }

  const result = await callAI(config, [
    { role: "system", content: `Você é um consultor jurídico em Portugal. Com base no estado do lead/caso, sugira a próxima ação concreta.
Opções comuns: ligar ao cliente, enviar proposta, agendar reunião, pedir documentos, encaminhar para advogado, classificar como inviável.
Responda com: 1) Ação recomendada (máx. 10 palavras), 2) Justificação breve (máx. 2 frases).` },
    { role: "user", content: `LEAD: ${lead.name} | Fase: ${lead.funnel_stage} | Área: ${lead.legal_area || "não definida"} | Score IA: ${lead.ai_score || 0} | Viabilidade: ${lead.ai_viability || "pendente"} | Urgência: ${lead.urgency || "normal"}${caseInfo}${conversationContext}` },
  ]);

  const suggestion = result.choices?.[0]?.message?.content || "Sugestão indisponível";
  return { success: true, suggestion, model_used: config.model };
}

// ─── ACTION: extract_lead_data ────────────────────────────────────────────────
async function extractLeadData(supabase: any, config: any, conversationId: string) {
  const msgs = await fetchConversationMessages(supabase, conversationId, 50);
  if (msgs.length === 0) throw { status: 400, message: "Conversa sem mensagens" };

  const formatted = formatMessages(msgs);
  const legalAreas = ["previdencia", "cidadania", "vistos", "trabalhista", "familia", "empresarial", "tributario", "outro"];

  const result = await callAI(config, [
    { role: "system", content: `Extraia dados do potencial cliente a partir da conversa. Use tool calling para retornar os dados estruturados. Extraia apenas o que estiver explícito na conversa.` },
    { role: "user", content: `Extraia os dados do cliente desta conversa:\n\n${formatted}` },
  ], [{
    type: "function",
    function: {
      name: "extract_client_data",
      description: "Extract client data from conversation",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Client full name" },
          phone: { type: "string", description: "Phone number" },
          email: { type: "string", description: "Email address" },
          legal_area: { type: "string", enum: legalAreas, description: "Legal area of interest" },
          country: { type: "string", description: "Country of origin or residence" },
          notes: { type: "string", description: "Brief summary of the client's need" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  }], { type: "function", function: { name: "extract_client_data" } });

  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw { status: 500, message: "AI did not return extracted data" };

  const extracted = JSON.parse(toolCall.function.arguments);

  // Verificar se já existe lead vinculado
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  const { data: conv } = await supabase
    .from("conversations")
    .select("channel")
    .eq("id", conversationId)
    .single();

  const channelToOrigin: Record<string, string> = {
    whatsapp: "whatsapp", instagram: "instagram", email: "email", webchat: "outro",
  };

  if (existingLead) {
    const updateData: any = {};
    if (extracted.name) updateData.name = extracted.name;
    if (extracted.phone) updateData.phone = extracted.phone;
    if (extracted.email) updateData.email = extracted.email;
    if (extracted.legal_area) updateData.legal_area = extracted.legal_area;
    if (extracted.country) updateData.country = extracted.country;
    if (extracted.notes) updateData.notes = extracted.notes;

    await supabase.from("leads").update(updateData).eq("id", existingLead.id);
    return { success: true, extracted, lead_id: existingLead.id, action: "updated", model_used: config.model };
  } else {
    const { data: newLead, error: insertErr } = await supabase.from("leads").insert({
      name: extracted.name || "Sem nome",
      phone: extracted.phone || null,
      email: extracted.email || null,
      legal_area: extracted.legal_area || "outro",
      country: extracted.country || "Portugal",
      notes: extracted.notes || null,
      conversation_id: conversationId,
      origin: channelToOrigin[conv?.channel] || "outro",
    }).select("id").single();

    if (insertErr) throw { status: 500, message: `Failed to create lead: ${insertErr.message}` };
    return { success: true, extracted, lead_id: newLead.id, action: "created", model_used: config.model };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabase();
    const { action, lead_id, conversation_id } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolver configuração do provedor de IA uma única vez
    const config = await resolveAIConfig(supabase);
    console.log(`[AI-AUTOMATION] Action: ${action} | Model: ${config.model}`);

    let result: any;

    switch (action) {
      case "classify_lead":
        if (!lead_id) throw { status: 400, message: "lead_id is required" };
        result = await classifyLead(supabase, config, lead_id);
        break;

      case "summarize_conversation":
        if (!conversation_id) throw { status: 400, message: "conversation_id is required" };
        result = await summarizeConversation(supabase, config, conversation_id);
        break;

      case "suggest_next_action":
        if (!lead_id) throw { status: 400, message: "lead_id is required" };
        result = await suggestNextAction(supabase, config, lead_id);
        break;

      case "extract_lead_data":
        if (!conversation_id) throw { status: 400, message: "conversation_id is required" };
        result = await extractLeadData(supabase, config, conversation_id);
        break;

      default:
        throw { status: 400, message: `Unknown action: ${action}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[AI-AUTOMATION] Error:", e);
    const status = e.status || 500;
    const message = e.message || "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
