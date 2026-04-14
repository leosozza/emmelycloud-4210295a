import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${endpoint}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function callBitrixListAll(
  endpoint: string,
  token: string,
  method: string,
  params: Record<string, any> = {},
  limit = 500
): Promise<any[]> {
  let allResults: any[] = [];
  let start = 0;
  let hasMore = true;

  while (hasMore && allResults.length < limit) {
    const res = await callBitrix(endpoint, token, method, { ...params, start });
    const batch = Array.isArray(res.result) ? res.result : [];
    allResults = allResults.concat(batch);
    if (res.next && batch.length > 0) {
      start = res.next;
    } else {
      hasMore = false;
    }
  }
  return allResults;
}


async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return integration.access_token;
  }

  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Token refresh: ${data.error}`);

  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);

  integration.access_token = data.access_token;
  return data.access_token;
}

// Map funnel_stage to Bitrix24 STATUS_ID
function mapFunnelStage(stage: string): string {
  const map: Record<string, string> = {
    lead: "NEW",
    contactado: "IN_PROCESS",
    qualificado: "PROCESSED",
    proposta: "3", // Custom stages
    analise: "4",
    contrato: "5",
    financeiro: "6",
    fechado: "CONVERTED",
    perdido: "JUNK",
  };
  return map[stage] || "NEW";
}

// Map Bitrix24 STATUS_ID back to funnel_stage
export function mapStatusToFunnel(statusId: string): string {
  const map: Record<string, string> = {
    NEW: "lead",
    IN_PROCESS: "contactado",
    PROCESSED: "qualificado",
    CONVERTED: "fechado",
    JUNK: "perdido",
    "1": "lead",
    "2": "contactado",
    "3": "proposta",
    "4": "analise",
    "5": "contrato",
    "6": "financeiro",
  };
  return map[statusId] || "lead";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { action, lead_id, data } = body;

    if (!action || !lead_id) {
      return new Response(JSON.stringify({ error: "action and lead_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active integration
    const { data: integration, error: intError } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (intError || !integration || !integration.client_endpoint) {
      console.log("[SYNC] No active Bitrix24 integration found, skipping sync");
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_integration" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await ensureValidToken(supabase, integration);

    // Get lead from DB
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Bitrix24 fields
    const fields: Record<string, any> = {
      TITLE: lead.name || data?.name || "Sem nome",
    };

    const phone = lead.phone || data?.phone;
    if (phone) {
      fields.PHONE = [{ VALUE: phone, VALUE_TYPE: "WORK" }];
    }

    const email = lead.email || data?.email;
    if (email) {
      fields.EMAIL = [{ VALUE: email, VALUE_TYPE: "WORK" }];
    }

    if (lead.legal_area) {
      fields.UF_LEGAL_AREA = lead.legal_area;
    }

    if (lead.funnel_stage) {
      fields.STATUS_ID = mapFunnelStage(lead.funnel_stage);
    }

    if (lead.notes) {
      fields.COMMENTS = lead.notes;
    }

    const bitrix24Id = lead.bitrix24_id;

    if (bitrix24Id && (action === "lead_update" || action === "lead_create")) {
      // Update existing
      console.log("[SYNC] Updating Bitrix24 lead:", bitrix24Id);
      const result = await callBitrix(integration.client_endpoint, accessToken, "crm.lead.update", {
        ID: bitrix24Id,
        FIELDS: fields,
      });

      if (result.error) {
        console.error("[SYNC] crm.lead.update error:", result.error, result.error_description);
        return new Response(JSON.stringify({ error: result.error_description || result.error }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark sync_source to prevent loop
      await supabase.from("leads").update({ sync_source: "emmely" }).eq("id", lead_id);

      console.log("[SYNC] Lead updated in Bitrix24:", bitrix24Id);
      return new Response(JSON.stringify({ ok: true, action: "updated", bitrix24_id: bitrix24Id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Create new
      console.log("[SYNC] Creating Bitrix24 lead for:", lead.name);
      const result = await callBitrix(integration.client_endpoint, accessToken, "crm.lead.add", {
        FIELDS: fields,
      });

      if (result.error) {
        console.error("[SYNC] crm.lead.add error:", result.error, result.error_description);
        return new Response(JSON.stringify({ error: result.error_description || result.error }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newBitrixId = String(result.result);

      // Save bitrix24_id and mark sync_source
      await supabase.from("leads").update({
        bitrix24_id: newBitrixId,
        sync_source: "emmely",
      }).eq("id", lead_id);

      console.log("[SYNC] Lead created in Bitrix24:", newBitrixId);
      return new Response(JSON.stringify({ ok: true, action: "created", bitrix24_id: newBitrixId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("[SYNC] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
