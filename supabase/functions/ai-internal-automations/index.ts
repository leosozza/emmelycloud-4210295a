import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function getAIConfig() {
  const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
  return {
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey,
    model: "google/gemini-2.5-flash-lite",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

async function callAI(config: ReturnType<typeof getAIConfig>, messages: any[], tools?: any[], toolChoice?: any) {
  const body: any = { model: config.model, messages, temperature: 0.2 };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI error ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function logRun(supabase: any, type: string, entityId: string | null, entityType: string | null, status: string, result?: any, error?: string) {
  await supabase.from("automation_runs").insert({
    automation_type: type,
    entity_id: entityId,
    entity_type: entityType,
    status,
    result: result || {},
    error_message: error || null,
  });
}

// ─── 1. Auto Summary ─────────────────────────────────────────────────────────
async function runAutoSummary(supabase: any, config: ReturnType<typeof getAIConfig>, settings: any) {
  const minMessages = settings?.min_messages || 10;
  const cooldownHours = settings?.cooldown_hours || 4;
  const cooldownCutoff = new Date(Date.now() - cooldownHours * 3600000).toISOString();

  // Find conversations with enough new messages and no recent summary
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, contact_name, contact_phone, contact_lid, contact_instagram, channel")
    .in("status", ["open", "pending"])
    .order("last_message_at", { ascending: false })
    .limit(20);

  if (!conversations?.length) return { processed: 0 };

  let processed = 0;

  for (const conv of conversations) {
    try {
      // Check message count
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id);

      if ((count || 0) < minMessages) continue;

      // Check for recent summary
      const { data: recentSummary } = await supabase
        .from("conversation_summaries")
        .select("id")
        .eq("conversation_id", conv.id)
        .gte("created_at", cooldownCutoff)
        .limit(1);

      if (recentSummary?.length) continue;

      // Fetch messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, direction, sender_name, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(60);

      if (!msgs?.length) continue;

      const formatted = msgs.map((m: any) =>
        `[${m.direction === "inbound" ? m.sender_name || "Cliente" : "Atendente"}]: ${m.content}`
      ).join("\n");

      const result = await callAI(config, [
        { role: "system", content: "Resuma esta conversa de forma concisa em português de Portugal. Inclua: assunto principal, pedidos do cliente, informações relevantes e estado atual. Máximo 4 frases." },
        { role: "user", content: formatted },
      ]);

      const summary = result.choices?.[0]?.message?.content || "";
      if (!summary) continue;

      // Save summary
      await supabase.from("conversation_summaries").insert({
        conversation_id: conv.id,
        summary_text: summary,
        messages_summarized: msgs.length,
        message_count_at_compaction: count || msgs.length,
      });

      // Update lead notes if linked
      const { data: lead } = await supabase
        .from("leads")
        .select("id, notes")
        .eq("conversation_id", conv.id)
        .maybeSingle();

      if (lead) {
        const date = new Date().toLocaleDateString("pt-PT");
        const updatedNotes = lead.notes
          ? `${lead.notes}\n\n--- Resumo Auto IA (${date}) ---\n${summary}`
          : `--- Resumo Auto IA (${date}) ---\n${summary}`;
        await supabase.from("leads").update({ notes: updatedNotes }).eq("id", lead.id);
      }

      // Notify team
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "comercial"]);

      for (const admin of admins || []) {
        await supabase.from("notifications").insert({
          user_id: admin.user_id,
          type: "automation",
          title: "Resumo Automático",
          message: `Conversa com ${conv.contact_name}: ${summary.slice(0, 120)}...`,
          entity_type: "conversation",
          entity_id: conv.id,
        });
      }

      await logRun(supabase, "summary", conv.id, "conversation", "success", { summary_length: summary.length });
      processed++;

      if (processed >= 5) break; // limit per run
    } catch (e: any) {
      await logRun(supabase, "summary", conv.id, "conversation", "error", null, e.message);
    }
  }

  return { processed };
}

// ─── 2. Auto Classify ─────────────────────────────────────────────────────────
async function runAutoClassify(supabase: any, config: ReturnType<typeof getAIConfig>, settings: any) {
  const maxAgeHours = settings?.max_age_hours || 24;
  const cutoff = new Date(Date.now() - maxAgeHours * 3600000).toISOString();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, email, phone, country, origin, legal_area, urgency, notes, conversation_id")
    .is("ai_score", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!leads?.length) return { processed: 0 };

  const legalAreas = ["previdencia", "cidadania", "vistos", "trabalhista", "familia", "empresarial", "tributario", "outro"];
  let processed = 0;

  for (const lead of leads) {
    try {
      let conversationContext = "";
      if (lead.conversation_id) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("content, direction, sender_name")
          .eq("conversation_id", lead.conversation_id)
          .order("created_at", { ascending: true })
          .limit(20);

        if (msgs?.length) {
          conversationContext = "\n\nHISTÓRICO:\n" + msgs.map((m: any) =>
            `[${m.direction === "inbound" ? m.sender_name || "Cliente" : "Atendente"}]: ${m.content}`
          ).join("\n");
        }
      }

      const result = await callAI(config, [
        { role: "system", content: "Classifique este lead jurídico. Seja preciso e objetivo." },
        { role: "user", content: `Nome: ${lead.name}\nEmail: ${lead.email || "N/A"}\nPaís: ${lead.country || "N/A"}\nOrigem: ${lead.origin}\nÁrea: ${lead.legal_area || "N/A"}\nNotas: ${lead.notes || "nenhuma"}${conversationContext}` },
      ], [{
        type: "function",
        function: {
          name: "classify_lead",
          description: "Classify lead",
          parameters: {
            type: "object",
            properties: {
              legal_area: { type: "string", enum: legalAreas },
              urgency: { type: "string", enum: ["normal", "alta", "critica"] },
              ai_score: { type: "number" },
              ai_viability: { type: "string", enum: ["alta", "media", "baixa", "pendente"] },
              notes: { type: "string" },
            },
            required: ["legal_area", "urgency", "ai_score", "ai_viability", "notes"],
            additionalProperties: false,
          },
        },
      }], { type: "function", function: { name: "classify_lead" } });

      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) continue;

      const classification = JSON.parse(toolCall.function.arguments);
      classification.ai_score = Math.max(0, Math.min(100, Math.round(classification.ai_score)));

      await supabase.from("leads").update({
        legal_area: classification.legal_area,
        urgency: classification.urgency,
        ai_score: classification.ai_score,
        ai_viability: classification.ai_viability,
        notes: classification.notes,
      }).eq("id", lead.id);

      await logRun(supabase, "classify", lead.id, "lead", "success", classification);
      processed++;
    } catch (e: any) {
      await logRun(supabase, "classify", lead.id, "lead", "error", null, e.message);
    }
  }

  return { processed };
}

// ─── 3. Follow-up por Inatividade ─────────────────────────────────────────────
async function runFollowup(supabase: any, config: ReturnType<typeof getAIConfig>, settings: any) {
  const inactiveDays = settings?.inactive_days || 7;
  const criticalDays = settings?.critical_days || 30;
  const cutoff = new Date(Date.now() - inactiveDays * 86400000).toISOString();
  const criticalCutoff = new Date(Date.now() - criticalDays * 86400000).toISOString();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, funnel_stage, legal_area, ai_score, urgency, assigned_commercial_id, updated_at")
    .not("funnel_stage", "in", '("fechado","perdido")')
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(15);

  if (!leads?.length) return { processed: 0 };

  let processed = 0;

  for (const lead of leads) {
    try {
      const isCritical = new Date(lead.updated_at) < new Date(criticalCutoff);
      const daysSince = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000);

      const result = await callAI(config, [
        { role: "system", content: "Sugira a próxima ação para este lead inativo. Responda com: 1) Ação (máx 10 palavras), 2) Justificação (1 frase)." },
        { role: "user", content: `Lead: ${lead.name} | Fase: ${lead.funnel_stage} | Área: ${lead.legal_area || "N/A"} | Score: ${lead.ai_score || 0} | Inativo há ${daysSince} dias${isCritical ? " (CRÍTICO)" : ""}` },
      ]);

      const suggestion = result.choices?.[0]?.message?.content || "Follow-up necessário";

      // Notify responsible or admins
      const targetUsers = lead.assigned_commercial_id
        ? [{ user_id: lead.assigned_commercial_id }]
        : (await supabase.from("user_roles").select("user_id").eq("role", "admin")).data || [];

      for (const u of targetUsers) {
        await supabase.from("notifications").insert({
          user_id: u.user_id,
          type: isCritical ? "sla" : "lead",
          title: isCritical ? "⚠️ Lead Crítico — Sem Atividade" : "Follow-up Necessário",
          message: `${lead.name} (${daysSince}d inativo): ${suggestion.slice(0, 150)}`,
          entity_type: "lead",
          entity_id: lead.id,
        });
      }

      await logRun(supabase, "followup", lead.id, "lead", "success", { days_inactive: daysSince, is_critical: isCritical, suggestion: suggestion.slice(0, 200) });
      processed++;
    } catch (e: any) {
      await logRun(supabase, "followup", lead.id, "lead", "error", null, e.message);
    }
  }

  return { processed };
}

// ─── 4. Análise de Sentimento ─────────────────────────────────────────────────
async function runSentiment(supabase: any, config: ReturnType<typeof getAIConfig>, settings: any) {
  const messageCount = settings?.message_count || 5;

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, contact_name, contact_phone, contact_lid, contact_instagram, contact_email, channel")
    .in("status", ["open", "pending"])
    .order("last_customer_message_at", { ascending: false })
    .limit(15);

  if (!conversations?.length) return { processed: 0 };

  let processed = 0;

  for (const conv of conversations) {
    try {
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, direction, created_at")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(messageCount);

      if (!msgs?.length || msgs.length < 2) continue;

      const formatted = msgs.reverse().map((m: any) => m.content).join("\n");

      const result = await callAI(config, [
        { role: "system", content: "Analise o sentimento destas mensagens do cliente. Use tool calling." },
        { role: "user", content: formatted },
      ], [{
        type: "function",
        function: {
          name: "analyze_sentiment",
          description: "Analyze customer sentiment",
          parameters: {
            type: "object",
            properties: {
              sentiment: { type: "string", enum: ["positivo", "neutro", "negativo", "frustrado"] },
              confidence: { type: "number", description: "0-1" },
              reason: { type: "string", description: "Brief reason (1 sentence)" },
            },
            required: ["sentiment", "confidence", "reason"],
            additionalProperties: false,
          },
        },
      }], { type: "function", function: { name: "analyze_sentiment" } });

      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) continue;

      const analysis = JSON.parse(toolCall.function.arguments);

      // Save to user_memory
      const contactId = conv.contact_phone || conv.contact_lid || conv.contact_instagram || conv.contact_email;
      const channel = conv.channel || "whatsapp";
      if (contactId) {
        await supabase.rpc("upsert_user_memory", {
          p_channel: channel,
          p_contact_id: contactId,
          p_key: "sentiment",
          p_value: JSON.stringify(analysis),
          p_confidence: analysis.confidence || 0.8,
          p_source: "auto_sentiment",
        });
      }

      // If frustrated, send urgent notification
      if (analysis.sentiment === "frustrado" || analysis.sentiment === "negativo") {
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "comercial"]);

        for (const admin of admins || []) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "sla",
            title: analysis.sentiment === "frustrado" ? "🔴 Cliente Frustrado" : "⚠️ Sentimento Negativo",
            message: `${conv.contact_name}: ${analysis.reason}`,
            entity_type: "conversation",
            entity_id: conv.id,
          });
        }
      }

      await logRun(supabase, "sentiment", conv.id, "conversation", "success", analysis);
      processed++;
    } catch (e: any) {
      await logRun(supabase, "sentiment", conv.id, "conversation", "error", null, e.message);
    }
  }

  return { processed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getSupabase();
  const config = getAIConfig();
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const requestedActions: string[] = body.actions || ["summary", "classify", "followup", "sentiment"];

    // Load settings
    const { data: allSettings } = await supabase
      .from("automation_settings")
      .select("automation_type, is_enabled, config");

    const settingsMap: Record<string, any> = {};
    for (const s of allSettings || []) {
      settingsMap[s.automation_type] = { enabled: s.is_enabled, config: s.config };
    }

    const results: Record<string, any> = {};

    for (const action of requestedActions) {
      const setting = settingsMap[action];
      if (setting && !setting.enabled) {
        results[action] = { skipped: true, reason: "disabled" };
        continue;
      }

      const cfg = setting?.config || {};

      try {
        switch (action) {
          case "summary":
            results.summary = await runAutoSummary(supabase, config, cfg);
            break;
          case "classify":
            results.classify = await runAutoClassify(supabase, config, cfg);
            break;
          case "followup":
            results.followup = await runFollowup(supabase, config, cfg);
            break;
          case "sentiment":
            results.sentiment = await runSentiment(supabase, config, cfg);
            break;
          default:
            results[action] = { error: "unknown action" };
        }
      } catch (e: any) {
        results[action] = { error: e.message };
        console.error(`[AI-INTERNAL] Error in ${action}:`, e.message);
      }
    }

    const latency = Date.now() - startTime;
    console.log(`[AI-INTERNAL] Done in ${latency}ms:`, JSON.stringify(results));

    return new Response(JSON.stringify({ results, latency_ms: latency }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[AI-INTERNAL] Fatal:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
