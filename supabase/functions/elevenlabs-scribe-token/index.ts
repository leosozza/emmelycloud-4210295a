import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get ElevenLabs API key from integration_credentials
    const { data: cred } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", "elevenlabs")
      .eq("credential_key", "api_key")
      .single();

    const apiKey = cred?.credential_value?.trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No ElevenLabs API key found. Configure it in Integrações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request single-use token for realtime scribe
    const tokenResponse = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
      }
    );

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("ElevenLabs scribe token error:", tokenResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${tokenResponse.status}` }),
        { status: tokenResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token } = await tokenResponse.json();

    return new Response(JSON.stringify({ token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("elevenlabs-scribe-token error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
