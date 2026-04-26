// MCP Server (Streamable HTTP / JSON-RPC 2.0)
// Compatível com OpenClaw, Claude Desktop, Cursor, Continue, etc.
//
// Autenticação (qualquer um dos seguintes headers):
//   X-API-Key: emk_live_...        ← preferido pelo OpenClaw
//   Authorization: Bearer emk_live_...
//   Authorization: ApiKey emk_live_...
//
// Gere chaves em https://emmelycloud.lovable.app/api-docs/keys

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id, x-api-key, accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface AuthCtx {
  user_id: string;
  scopes: string[];
  key_id: string;
}

function extractApiKey(req: Request): string | null {
  // 1) X-API-Key header (preferido pelo OpenClaw)
  const xKey = req.headers.get("X-API-Key") || req.headers.get("x-api-key");
  if (xKey && xKey.startsWith("emk_live_")) return xKey.trim();

  // 2) Authorization: Bearer / ApiKey
  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const m = auth.match(/^(?:Bearer|ApiKey)\s+(emk_live_[A-Za-z0-9_-]+)$/i);
  if (m) return m[1];

  // 3) ?api_key=... (último recurso)
  const url = new URL(req.url);
  const qp = url.searchParams.get("api_key");
  if (qp && qp.startsWith("emk_live_")) return qp;

  return null;
}

async function authenticate(req: Request): Promise<AuthCtx | null> {
  const key = extractApiKey(req);
  if (!key) return null;
  const hash = await sha256(key);
  const { data, error } = await admin.rpc("verify_api_key", { p_key_hash: hash });
  if (error || !data || !data.length) return null;
  return data[0] as AuthCtx;
}


// ── MCP Tools ──
const TOOLS = [
  {
    name: "list_leads",
    description: "Lista leads do CRM Emmely. Permite filtrar por funil e limitar resultados.",
    inputSchema: {
      type: "object",
      properties: {
        funnel_stage: { type: "string", enum: ["novo", "qualificado", "proposta", "contrato", "financeiro", "fechado", "perdido"] },
        limit: { type: "number", default: 20, maximum: 100 },
      },
    },
  },
  {
    name: "get_lead",
    description: "Obtém os detalhes de um lead específico pelo ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "UUID do lead" } },
      required: ["id"],
    },
  },
  {
    name: "create_lead",
    description: "Cria um novo lead no funil.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        origin: { type: "string", default: "api" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "send_whatsapp",
    description: "Envia uma mensagem WhatsApp para uma conversa existente.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["conversation_id", "content"],
    },
  },
  {
    name: "list_conversations",
    description: "Lista conversas omnichannel (WhatsApp, Instagram, Email).",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["whatsapp", "instagram", "email"] },
        status: { type: "string", enum: ["open", "pending", "closed"] },
        limit: { type: "number", default: 20, maximum: 100 },
      },
    },
  },
  {
    name: "list_financial_records",
    description: "Lista parcelas financeiras (faturas/cobranças).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pendente", "paga", "vencida", "cancelada"] },
        limit: { type: "number", default: 20, maximum: 100 },
      },
    },
  },
  {
    name: "create_payment_link",
    description: "Cria um link de pagamento (Stripe/Asaas) para um cliente.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        currency: { type: "string", default: "BRL" },
        description: { type: "string" },
        gateway: { type: "string", enum: ["stripe_pt", "stripe_br", "asaas"], default: "asaas" },
        method: { type: "string", enum: ["pix", "credit_card", "boleto"], default: "pix" },
      },
      required: ["amount"],
    },
  },
  {
    name: "search_knowledge",
    description: "Pesquisa na base de conhecimento (RAG) usando full-text search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", default: 5, maximum: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_dashboard",
    description: "Obtém os KPIs principais do dashboard (leads, receita, conversões).",
    inputSchema: { type: "object", properties: {} },
  },
];

async function executeTool(name: string, args: any, ctx: AuthCtx) {
  switch (name) {
    case "list_leads": {
      let q = admin.from("leads").select("id, name, phone, email, funnel_stage, origin, ai_score, created_at").limit(Math.min(args.limit || 20, 100));
      if (args.funnel_stage) q = q.eq("funnel_stage", args.funnel_stage);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
    case "get_lead": {
      const { data, error } = await admin.from("leads").select("*").eq("id", args.id).maybeSingle();
      if (error) throw error;
      return data;
    }
    case "create_lead": {
      const { data, error } = await admin.from("leads").insert({
        name: args.name, phone: args.phone, email: args.email,
        origin: args.origin || "api", notes: args.notes,
      }).select().single();
      if (error) throw error;
      return data;
    }
    case "send_whatsapp": {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/message-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ conversation_id: args.conversation_id, content: args.content }),
      });
      return await r.json();
    }
    case "list_conversations": {
      let q = admin.from("conversations").select("id, channel, contact_name, contact_phone, status, unread_count, last_message_at").limit(Math.min(args.limit || 20, 100));
      if (args.channel) q = q.eq("channel", args.channel);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q.order("last_message_at", { ascending: false });
      if (error) throw error;
      return data;
    }
    case "list_financial_records": {
      let q = admin.from("financial_records").select("id, total_value, installment_value, currency, status, due_date, paid_at").limit(Math.min(args.limit || 20, 100));
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q.order("due_date", { ascending: false });
      if (error) throw error;
      return data;
    }
    case "create_payment_link": {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-create-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify(args),
      });
      return await r.json();
    }
    case "search_knowledge": {
      const { data: docs } = await admin.from("knowledge_documents").select("id").limit(50);
      const ids = (docs || []).map((d: any) => d.id);
      if (!ids.length) return [];
      const { data, error } = await admin.rpc("search_chunks_fts", {
        search_query: args.query, doc_ids: ids, max_results: Math.min(args.limit || 5, 20),
      });
      if (error) throw error;
      return data;
    }
    case "get_dashboard": {
      const { data, error } = await admin.rpc("get_dashboard_data");
      if (error) throw error;
      return data;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function jsonRpcResponse(id: any, result?: any, error?: any) {
  const body: any = { jsonrpc: "2.0", id };
  if (error) body.error = error;
  else body.result = result;
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // GET → discovery (server info / health)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        name: "emmely-mcp",
        version: "1.0.0",
        description: "Emmely Cloud MCP Server — acesso programático ao CRM, omnichannel, pagamentos, agentes de IA e Bitrix24.",
        protocol: "mcp/2024-11-05",
        transport: "streamable-http",
        endpoints: { rpc: "POST /" },
        auth: {
          type: "api_key",
          header: "X-API-Key",
          alternative_headers: ["Authorization: Bearer <key>", "Authorization: ApiKey <key>"],
          format: "emk_live_<base64url>",
          generate_at: "https://emmelycloud.lovable.app/api-docs/keys",
        },
        tools_count: TOOLS.length,
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const ctx = await authenticate(req);
    if (!ctx) {
      return new Response(
        JSON.stringify(jsonRpcResponse(null, undefined, { code: -32001, message: "Invalid or missing API key" })),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { id, method, params } = body;

    let result: any;
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "emmely-mcp", version: "1.0.0" },
        };
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const out = await executeTool(toolName, toolArgs, ctx);
        result = {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          isError: false,
        };
        break;
      }
      case "ping":
        result = {};
        break;
      default:
        return new Response(
          JSON.stringify(jsonRpcResponse(id, undefined, { code: -32601, message: `Method not found: ${method}` })),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(jsonRpcResponse(id, result)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify(jsonRpcResponse(null, undefined, { code: -32603, message: String(e?.message || e) })),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
