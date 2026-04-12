import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SKILL_TYPES = [
  { key: "crm_search", label: "Pesquisa CRM", description: "Buscar leads, clientes e casos no sistema" },
  { key: "crm_create", label: "Criar no CRM", description: "Criar leads e registros no CRM" },
  { key: "payment_create", label: "Criar Pagamento", description: "Gerar links e cobranças de pagamento" },
  { key: "payment_status", label: "Status Pagamento", description: "Consultar status de pagamentos" },
  { key: "flow_trigger", label: "Executar Fluxo", description: "Disparar fluxos de automação" },
  { key: "knowledge_search", label: "Busca Knowledge Base", description: "Consultar documentos e base de conhecimento" },
  { key: "webhook_call", label: "Chamada Webhook", description: "Integrar com sistemas externos via API/webhook (ex: Bitrix24, calendários)" },
  { key: "schedule", label: "Agendamento", description: "Consultar e criar agendamentos em calendários integrados" },
  { key: "navigate_graph", label: "Grafo de Entidades", description: "Navegar relações entre leads, contratos e casos" },
  { key: "send_email", label: "Enviar Email", description: "Enviar emails automatizados" },
  { key: "generate_document", label: "Gerar Documento", description: "Criar propostas e documentos" },
];

const SYSTEM_PROMPT = `Você é um assistente especializado em criar agentes de IA. O utilizador vai descrever o que precisa e você deve:

1. Analisar o pedido cuidadosamente
2. Fazer 2-3 perguntas clarificadoras essenciais (nome, tom, comportamentos específicos)
3. Quando tiver informação suficiente, gerar a configuração completa do agente

## Skills Disponíveis
${SKILL_TYPES.map(s => `- **${s.key}**: ${s.label} — ${s.description}`).join("\n")}

## Regras
- Responda SEMPRE em português (pt-PT)
- Seja conciso e amigável nas perguntas
- Quando tiver informação suficiente para criar o agente, inclua um bloco de configuração no formato:

\`\`\`agent-config
{
  "name": "Nome do Agente",
  "description": "Descrição curta",
  "system_prompt": "Instruções detalhadas para o agente...",
  "personality_style": "professional|persuasive|friendly|technical",
  "communication_tone": "empathetic|assertive|neutral|warm",
  "agent_type": "text|voice|hybrid",
  "temperature": 0.7,
  "ai_provider": "lovable",
  "ai_model": "google/gemini-3-flash-preview",
  "welcome_message": "Mensagem de boas-vindas",
  "fallback_message": "Mensagem quando não entende",
  "strategic_objective": "Objectivo principal do agente",
  "skills": ["skill_key1", "skill_key2"],
  "governance_mode": "autonomous|supervised|restricted",
  "monthly_budget_usd": null
}
\`\`\`

- O system_prompt deve ser detalhado, profissional e incluir instruções específicas para o caso de uso
- Escolha as skills correctas com base na descrição do utilizador
- Se o utilizador mencionar Bitrix24, agenda, calendário → inclua "webhook_call" e/ou "schedule"
- Se mencionar pagamentos → inclua "payment_create" e "payment_status"
- Se mencionar documentos ou knowledge base → inclua "knowledge_search"
- Se mencionar CRM, leads, clientes → inclua "crm_search" e possivelmente "crm_create"
- Sempre inclua uma mensagem de boas-vindas e fallback adequadas ao contexto
- Antes de gerar o bloco, apresente um resumo em texto do que vai ser criado e pergunte se pode prosseguir

## Contexto Adicional do Sistema
O sistema é uma plataforma jurídica com CRM, gestão de leads, contratos, propostas, e integração com Bitrix24 e canais de atendimento (WhatsApp, Instagram).`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context-aware system prompt
    let contextInfo = "";
    if (context) {
      if (context.flows?.length > 0) {
        contextInfo += `\n\n## Fluxos Disponíveis\n${context.flows.map((f: any) => `- ${f.name} (id: ${f.id})`).join("\n")}`;
      }
      if (context.collections?.length > 0) {
        contextInfo += `\n\n## Colecções de Conhecimento\n${context.collections.map((c: any) => `- ${c.collection_name} (${c.doc_count} docs)`).join("\n")}`;
      }
      if (context.existing_agents?.length > 0) {
        contextInfo += `\n\n## Agentes Existentes (para sub-agentes)\n${context.existing_agents.map((a: any) => `- ${a.name}: ${a.description || "sem descrição"}`).join("\n")}`;
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + contextInfo },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione fundos nas configurações." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-builder error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
