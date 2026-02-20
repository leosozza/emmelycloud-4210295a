import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_URL = "https://graph.instagram.com/v24.0";

async function resolveInstagramCredentials(supabase: any): Promise<{ token: string; accountId: string; instanceName: string }> {
  // Try channel_instances first
  const { data: instances } = await supabase
    .from("channel_instances")
    .select("id, name, config")
    .eq("channel_type", "instagram")
    .eq("status", "active")
    .order("created_at")
    .limit(1);

  const inst = instances?.[0];
  if (inst?.config) {
    const cfg = inst.config as Record<string, any>;
    const token = cfg.access_token || cfg.ig_access_token;
    const accountId = cfg.ig_account_id;
    if (token && accountId) {
      console.log(`[IG-SEND] Using instance: ${inst.name}`);
      return { token, accountId, instanceName: inst.name };
    }
  }

  // Fallback to env vars
  console.log("[IG-SEND] Falling back to env vars");
  return {
    token: Deno.env.get("META_PAGE_ACCESS_TOKEN")?.trim().replace(/[\r\n\s]+/g, "") || "",
    accountId: Deno.env.get("META_IG_ACCOUNT_ID")?.trim() || "",
    instanceName: "env-fallback",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, content } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "conversation_id and content required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conv, error: convError } = await serviceSupabase
      .from("conversations")
      .select("contact_instagram, channel")
      .eq("id", conversation_id)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (conv.channel !== "instagram") {
      return new Response(JSON.stringify({ error: "Not an Instagram conversation" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve credentials from instances or env
    const creds = await resolveInstagramCredentials(serviceSupabase);

    if (!creds.token) {
      return new Response(JSON.stringify({ error: "No Instagram access token configured. Create an active Instagram instance or set META_PAGE_ACCESS_TOKEN." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!creds.accountId) {
      return new Response(JSON.stringify({ error: "No Instagram account ID configured. Create an active Instagram instance or set META_IG_ACCOUNT_ID." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const igResponse = await fetch(`${GRAPH_URL}/${creds.accountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${creds.token}` },
      body: JSON.stringify({
        recipient: { id: conv.contact_instagram },
        message: { text: content },
      }),
    });

    const igResult = await igResponse.json();
    if (!igResponse.ok) {
      console.error(`[IG-SEND] API error (instance: ${creds.instanceName}):`, JSON.stringify(igResult));
      return new Response(JSON.stringify({ error: "Failed to send Instagram message", details: igResult }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await serviceSupabase.from("messages").insert({
      conversation_id, direction: "outbound", content,
      sender_name: "Atendente", external_id: igResult.message_id ?? null,
    });

    await serviceSupabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 100),
    }).eq("id", conversation_id);

    return new Response(JSON.stringify({ success: true, message_id: igResult.message_id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[IG-SEND] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
