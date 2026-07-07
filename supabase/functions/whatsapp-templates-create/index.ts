// Create/submit WhatsApp template to Gupshup and persist in whatsapp_templates
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Button {
  type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
  example?: string;
}

interface Body {
  element_name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language?: string;
  body: string;
  footer?: string;
  header?: { type: "TEXT"; text: string } | null;
  buttons?: Button[];
  example?: string[]; // values for {{1}}, {{2}}...
  button_url_example?: string;
}

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

function normalizeName(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function buildExampleBody(bodyText: string, examples: string[] = []) {
  let out = bodyText;
  examples.forEach((val, i) => {
    out = out.split(`{{${i + 1}}}`).join(val || `exemplo${i + 1}`);
  });
  // fill any remaining {{n}} with placeholder to satisfy Meta
  out = out.replace(/\{\{(\d+)\}\}/g, (_m, n) => `exemplo${n}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = (await req.json()) as Body;

    if (!body.element_name || !body.body || !body.category) {
      return new Response(JSON.stringify({ error: "element_name, body e category são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { apiKey, appId } = await getCreds(supabase);
    if (!apiKey || !appId) {
      return new Response(
        JSON.stringify({ error: "Credenciais Gupshup em falta (GUPSHUP_API_KEY, GUPSHUP_APP_ID)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const elementName = normalizeName(body.element_name);
    const language = body.language || "pt_BR";
    const buttons = body.buttons || [];
    const exampleValues = body.example || [];
    const exampleBody = buildExampleBody(body.body, exampleValues);

    // Build Gupshup payload (application/x-www-form-urlencoded)
    const form = new URLSearchParams();
    form.set("elementName", elementName);
    form.set("languageCode", language);
    form.set("category", body.category);
    form.set("templateType", "TEXT");
    form.set("vertical", "Ticket update");
    form.set("content", body.body);
    form.set("example", exampleBody);
    form.set("enableSample", "true");
    if (body.footer) form.set("footer", body.footer);
    if (body.header?.text) form.set("header", body.header.text);

    if (buttons.length) {
      const btnPayload = buttons.map((b) => {
        if (b.type === "URL") {
          return {
            type: "URL",
            text: b.text,
            url: b.url || "",
            example: [b.example || b.url || ""],
          };
        }
        if (b.type === "PHONE_NUMBER") {
          return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number || "" };
        }
        return { type: "QUICK_REPLY", text: b.text };
      });
      form.set("buttons", JSON.stringify(btnPayload));
      if (buttons.some((b) => b.type === "URL" && /\{\{1\}\}/.test(b.url || ""))) {
        form.set("exampleMedia", body.button_url_example || "https://example.com");
      }
    }

    const url = `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/templates`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: form.toString(),
    });
    const raw = await res.text();
    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { payload = { raw }; }

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Falha ao criar template no Gupshup", gupshup: payload }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tpl = payload.template || payload;
    const gupshupStatus = (tpl.status || "PENDING").toUpperCase();
    const gupshupId = tpl.id || payload.id || null;

    const { data: saved, error } = await supabase
      .from("whatsapp_templates")
      .upsert(
        {
          provider: "gupshup",
          app_id: appId,
          element_name: elementName,
          category: body.category,
          language,
          body: body.body,
          footer: body.footer || null,
          header: body.header || null,
          buttons,
          example: { values: exampleValues, button_url: body.button_url_example || null },
          status: gupshupStatus,
          gupshup_template_id: gupshupId,
          rejection_reason: null,
        },
        { onConflict: "provider,app_id,element_name" }
      )
      .select()
      .single();
    if (error) console.error("[wa-templates-create] db error", error);

    return new Response(
      JSON.stringify({ success: true, template: saved, gupshup: payload }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[wa-templates-create] exception", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
