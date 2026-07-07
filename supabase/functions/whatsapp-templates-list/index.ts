// List/sync WhatsApp templates (Gupshup) into whatsapp_templates
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const url = new URL(req.url);
    let refresh = url.searchParams.get("refresh") === "true";
    if (!refresh && req.method === "POST") {
      try {
        const b = await req.json();
        if (b?.refresh === true) refresh = true;
      } catch { /* ignore */ }
    }

    if (!refresh) {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ templates: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { apiKey, appId } = await getCreds(supabase);
    if (!apiKey || !appId) {
      return new Response(
        JSON.stringify({ error: "Credenciais Gupshup em falta (GUPSHUP_API_KEY, GUPSHUP_APP_ID)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`, {
      headers: { apikey: apiKey, accept: "application/json" },
    });
    const raw = await res.text();
    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { payload = { raw }; }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Falha ao listar templates no Gupshup", gupshup: payload }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const templates: any[] = payload.templates || payload.data || [];
    const rows = templates.map((t: any) => {
      const meta = t.containerMeta ? (typeof t.containerMeta === "string" ? (() => { try { return JSON.parse(t.containerMeta); } catch { return {}; } })() : t.containerMeta) : {};
      const templateType = (t.templateType || meta.templateType || "TEXT").toUpperCase();
      const header = meta.header ? { type: templateType === "TEXT" ? "TEXT" : templateType, text: typeof meta.header === "string" ? meta.header : meta.header?.text, example: meta.sampleMedia || meta.exampleMedia } : null;
      return {
        provider: "gupshup",
        app_id: appId,
        element_name: t.elementName || t.templateName || t.name,
        category: (t.category || "UTILITY").toUpperCase(),
        language: t.languageCode || t.language || "pt_BR",
        template_type: templateType,
        body: t.data || meta.data || t.body || "",
        footer: meta.footer || null,
        header,
        cards: meta.cards || t.cards || null,
        buttons: meta.buttons || t.buttons || [],
        example: t.example ? { example: t.example } : {},
        status: (t.status || "PENDING").toUpperCase(),
        rejection_reason: t.reason || null,
        gupshup_template_id: t.id || t.templateId || null,
      };
    }).filter((r) => r.element_name);

    if (rows.length) {
      const { error } = await supabase
        .from("whatsapp_templates")
        .upsert(rows, { onConflict: "provider,app_id,element_name" });
      if (error) console.error("[wa-templates-list] upsert error", error);
    }

    const { data } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .order("created_at", { ascending: false });

    return new Response(
      JSON.stringify({ templates: data || [], synced: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[wa-templates-list] exception", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
