// Delete WhatsApp template from Gupshup + local DB
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

async function getCreds(supabase: any) {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_key, credential_value")
    .eq("provider", "gupshup");
  const map: Record<string, string> = {};
  (data || []).forEach((c: any) => {
    if (c.credential_key) map[c.credential_key] = (c.credential_value || "").trim();
  });
  return { apiKey: map.GUPSHUP_API_KEY || "", appId: map.GUPSHUP_APP_ID || "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { id, element_name } = await req.json();
    if (!id && !element_name) {
      return new Response(JSON.stringify({ error: "id ou element_name obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let elementName = element_name;
    let gupshupTemplateId: string | null = null;
    if (id) {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("element_name, gupshup_template_id")
        .eq("id", id)
        .maybeSingle();
      elementName = elementName || data?.element_name;
      gupshupTemplateId = data?.gupshup_template_id || null;
    }

    const { apiKey, appId } = await getCreds(supabase);
    if (apiKey && appId && (elementName || gupshupTemplateId)) {
      const path = gupshupTemplateId || elementName;
      const url = `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template/${encodeURIComponent(path!)}`;
      try {
        await fetch(url, { method: "DELETE", headers: { apikey: apiKey } });
      } catch (e) {
        console.warn("[wa-templates-delete] gupshup delete failed", e);
      }
    }

    if (id) {
      await supabase.from("whatsapp_templates").delete().eq("id", id);
    } else if (elementName) {
      await supabase.from("whatsapp_templates").delete().eq("element_name", elementName);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[wa-templates-delete] exception", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
