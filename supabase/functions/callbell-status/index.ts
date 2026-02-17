import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CALLBELL_API = "https://api.callbell.eu/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CALLBELL_TOKEN = Deno.env.get("CALLBELL_API_TOKEN");
    if (!CALLBELL_TOKEN) {
      return new Response(JSON.stringify({ error: "CALLBELL_API_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get conversation_id from query or body
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversation_id");

    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get outbound messages with external_id that aren't yet "read"
    const { data: pendingMessages, error: msgError } = await serviceSupabase
      .from("messages")
      .select("id, external_id, delivery_status")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .not("external_id", "is", null)
      .in("delivery_status", ["sent", "delivered"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (msgError) {
      return new Response(JSON.stringify({ error: msgError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: { id: string; status: string }[] = [];

    // Poll Callbell for each pending message
    for (const msg of pendingMessages ?? []) {
      try {
        const cbResponse = await fetch(`${CALLBELL_API}/messages/status/${msg.external_id}`, {
          headers: { Authorization: `Bearer ${CALLBELL_TOKEN}` },
        });

        if (!cbResponse.ok) continue;

        const cbResult = await cbResponse.json();
        const cbStatus = cbResult.message?.status;

        // Map Callbell status to our delivery_status
        let newStatus = msg.delivery_status;
        if (cbStatus === "read") {
          newStatus = "read";
        } else if (cbStatus === "delivered") {
          newStatus = "delivered";
        } else if (cbStatus === "sent" || cbStatus === "enqueued") {
          newStatus = "sent";
        }

        if (newStatus !== msg.delivery_status) {
          await serviceSupabase
            .from("messages")
            .update({ delivery_status: newStatus, ...(newStatus === "read" ? { read_at: new Date().toISOString() } : {}) })
            .eq("id", msg.id);

          updates.push({ id: msg.id, status: newStatus });
        }
      } catch (e) {
        console.error(`Failed to check status for ${msg.external_id}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, updated: updates }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Status check error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
