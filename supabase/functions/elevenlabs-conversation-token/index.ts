import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id } = await req.json();
    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get agent config
    const { data: agent, error: agentErr } = await supabase
      .from("ai_agents")
      .select("voice_provider, voice_model, voice_id")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!agent.voice_provider) {
      return new Response(
        JSON.stringify({ error: "Agent has no voice provider configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get API key from integration_credentials
    const { data: cred } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", agent.voice_provider)
      .eq("credential_key", "api_key")
      .single();

    const apiKey = cred?.credential_value;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `No API key found for provider '${agent.voice_provider}'. Configure it in Integrações.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get ElevenLabs Agent ID from integration_credentials (optional, for hosted agents)
    const { data: elevenlabsAgentCred } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", agent.voice_provider)
      .eq("credential_key", "agent_id")
      .single();

    const elevenlabsAgentId = elevenlabsAgentCred?.credential_value || agent.voice_id;

    if (!elevenlabsAgentId) {
      return new Response(
        JSON.stringify({ error: "No ElevenLabs Agent ID configured. Set voice_id on the agent or agent_id credential." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request conversation token from ElevenLabs
    const tokenResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${elevenlabsAgentId}`,
      {
        headers: { "xi-api-key": apiKey },
      }
    );

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("ElevenLabs token error:", tokenResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${tokenResponse.status}` }),
        { status: tokenResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token } = await tokenResponse.json();

    return new Response(JSON.stringify({ token, agent_id: elevenlabsAgentId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("elevenlabs-conversation-token error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
