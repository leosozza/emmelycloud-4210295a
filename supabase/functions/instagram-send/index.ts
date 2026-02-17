import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_URL = "https://graph.instagram.com/v24.0";

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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, content } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "conversation_id and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get conversation to find Instagram IGSID
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
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (conv.channel !== "instagram") {
      return new Response(JSON.stringify({ error: "Not an Instagram conversation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instagram User Access Token (IGAA... prefix) for Instagram Login apps
    const IG_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN")?.trim().replace(/[\r\n\s]+/g, "");
    if (!IG_TOKEN) {
      return new Response(JSON.stringify({ error: "META_PAGE_ACCESS_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const igAccountId = Deno.env.get("META_IG_ACCOUNT_ID")?.trim();
    if (!igAccountId) {
      return new Response(JSON.stringify({ error: "META_IG_ACCOUNT_ID not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("DEBUG IG token prefix:", IG_TOKEN.slice(0, 6), "length:", IG_TOKEN.length);
    console.log("DEBUG IG account ID:", igAccountId);
    console.log("DEBUG recipient IGSID:", conv.contact_instagram);

    // Send message via Instagram Messaging API (for Instagram Login apps)
    const sendEndpoint = `${GRAPH_URL}/${igAccountId}/messages`;

    const igResponse = await fetch(sendEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: conv.contact_instagram },
        message: { text: content },
        access_token: IG_TOKEN,
      }),
    });

    const igResult = await igResponse.json();
    if (!igResponse.ok) {
      console.error("Instagram API error:", JSON.stringify(igResult));
      return new Response(JSON.stringify({ error: "Failed to send Instagram message", details: igResult }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store outbound message
    await serviceSupabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      content,
      sender_name: "Atendente",
      external_id: igResult.message_id ?? null,
    });

    // Update conversation preview
    await serviceSupabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
      })
      .eq("id", conversation_id);

    return new Response(JSON.stringify({ success: true, message_id: igResult.message_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
