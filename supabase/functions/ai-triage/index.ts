import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch lead data
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation messages if available
    let conversationContext = "";
    if (lead.conversation_id) {
      const { data: messages } = await supabase
        .from("messages")
        .select("content, direction, sender_name")
        .eq("conversation_id", lead.conversation_id)
        .order("created_at", { ascending: true })
        .limit(30);

      if (messages && messages.length > 0) {
        conversationContext = "\n\nHISTÓRICO DA CONVERSA:\n" +
          messages.map((m: any) => `[${m.direction === "inbound" ? m.sender_name || "Cliente" : "Atendente"}]: ${m.content}`).join("\n");
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const legalAreas = ["previdencia", "cidadania", "vistos", "trabalhista", "familia", "empresarial", "tributario", "outro"];
    const urgencyLevels = ["normal", "alta", "critica"];

    const systemPrompt = `Você é um assistente jurídico especializado em triagem de leads para um escritório de advocacia em Portugal.
Analise os dados do lead e classifique-o usando tool calling. Seja preciso e objetivo.

Critérios de classificação:
- legal_area: a área jurídica mais provável com base no contexto disponível
- urgency: "normal" (prazo flexível), "alta" (necessita atenção em dias), "critica" (ação imediata necessária, prazos legais próximos)
- ai_score: de 0 a 100, representando a probabilidade de conversão/viabilidade do caso. Considere: clareza da necessidade, urgência real, dados de contacto completos, potencial valor do caso
- ai_viability: "alta" (caso claro com boas chances), "media" (precisa de mais informação ou caso moderado), "baixa" (fora do escopo ou sem mérito), "pendente" (dados insuficientes para decidir)
- notes: resumo conciso da análise (máximo 2 frases) incluindo justificação da classificação`;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_lead",
              description: "Classify a lead with legal area, urgency, viability score, and analysis notes",
              parameters: {
                type: "object",
                properties: {
                  legal_area: {
                    type: "string",
                    enum: legalAreas,
                    description: "The most likely legal area for this lead",
                  },
                  urgency: {
                    type: "string",
                    enum: urgencyLevels,
                    description: "The urgency level of this lead",
                  },
                  ai_score: {
                    type: "number",
                    description: "Viability/conversion probability score from 0 to 100",
                  },
                  ai_viability: {
                    type: "string",
                    enum: ["alta", "media", "baixa", "pendente"],
                    description: "Overall viability assessment",
                  },
                  notes: {
                    type: "string",
                    description: "Brief analysis summary (max 2 sentences)",
                  },
                },
                required: ["legal_area", "urgency", "ai_score", "ai_viability", "notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_lead" } },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, tente novamente em breve." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI classification failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI did not return classification" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classification = JSON.parse(toolCall.function.arguments);

    // Clamp score
    classification.ai_score = Math.max(0, Math.min(100, Math.round(classification.ai_score)));

    // Update lead in database
    const { error: updateErr } = await supabase
      .from("leads")
      .update({
        legal_area: classification.legal_area,
        urgency: classification.urgency,
        ai_score: classification.ai_score,
        ai_viability: classification.ai_viability,
        notes: classification.notes,
      })
      .eq("id", lead_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to update lead", classification }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, classification }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-triage error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
