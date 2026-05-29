// Lista templates HSM aprovados do Gupshup para o App configurado.
// GET /functions/v1/gupshup-templates  (?refresh=1 para invalidar cache)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CachedTemplates = { ts: number; data: any };
let CACHE: CachedTemplates | null = null;
const TTL_MS = 5 * 60 * 1000;

async function getCreds(supabase: any) {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_key, credential_value")
    .eq("provider", "gupshup");
  const map: Record<string, string> = {};
  (data || []).forEach((c: any) => {
    if (c.credential_key) map[c.credential_key] = (c.credential_value || "").trim();
  });
  return {
    apiKey: map.GUPSHUP_API_KEY || "",
    appName: map.GUPSHUP_APP_NAME || "",
    appId: map.GUPSHUP_APP_ID || "",
  };
}

function parseParamCount(body: string): number {
  if (!body) return 0;
  const matches = body.match(/\{\{(\d+)\}\}/g) || [];
  const nums = new Set<number>();
  matches.forEach((m) => {
    const n = Number(m.replace(/[^0-9]/g, ""));
    if (Number.isFinite(n) && n > 0) nums.add(n);
  });
  return nums.size;
}

function normalizeTemplate(t: any) {
  // Gupshup template shape may include: id, elementName, category, languageCode, status,
  // templateType, data (body text), containerMeta (JSON with "data" body) — handle both.
  let body: string = t?.data || "";
  if (!body && t?.containerMeta) {
    try {
      const meta = typeof t.containerMeta === "string" ? JSON.parse(t.containerMeta) : t.containerMeta;
      body = meta?.data || meta?.body || "";
    } catch { /* ignore */ }
  }
  let exampleParams: string[] = [];
  if (t?.containerMeta) {
    try {
      const meta = typeof t.containerMeta === "string" ? JSON.parse(t.containerMeta) : t.containerMeta;
      const ex = meta?.sampleText || meta?.example;
      if (typeof ex === "string") exampleParams = [];
    } catch { /* ignore */ }
  }
  return {
    id: t?.id || t?.templateId || t?.elementName,
    elementName: t?.elementName || t?.name || "",
    category: t?.category || "",
    language: t?.languageCode || t?.language || "",
    status: t?.status || "",
    templateType: t?.templateType || "TEXT",
    body,
    paramCount: parseParamCount(body),
    exampleParams,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    if (!forceRefresh && CACHE && Date.now() - CACHE.ts < TTL_MS) {
      return new Response(JSON.stringify({ ...CACHE.data, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { apiKey, appName, appId } = await getCreds(supabase);

    if (!apiKey || !appId) {
      const payload = {
        templates: [],
        reason: !apiKey ? "missing_api_key" : "missing_app_id",
        hint: "Configure GUPSHUP_API_KEY e GUPSHUP_APP_ID em Integrações → Gupshup.",
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tenta primeiro o endpoint oficial v2 do Gupshup.
    let gsUrl = `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`;
    console.log(`[GUPSHUP-TEMPLATES] Fetching templates via official endpoint: ${gsUrl}`);
    let res = await fetch(gsUrl, { headers: { apikey: apiKey, accept: "application/json" } });
    let raw = await res.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    // Fallback para o endpoint legado se o primeiro falhar (ex: status não 2xx ou sem templates/data)
    const hasTemplates = res.ok && (Array.isArray(parsed?.templates) || Array.isArray(parsed?.data));
    if (!hasTemplates) {
      const legacyUrl = `https://api.gupshup.io/sm/api/v1/template/list/${encodeURIComponent(appId)}`;
      console.log(`[GUPSHUP-TEMPLATES] Official v2 endpoint returned status ${res.status}. Falling back to legacy endpoint: ${legacyUrl}`);
      try {
        const legacyRes = await fetch(legacyUrl, { headers: { apikey: apiKey, accept: "application/json" } });
        const legacyRaw = await legacyRes.text();
        let legacyParsed: any = {};
        try { legacyParsed = JSON.parse(legacyRaw); } catch { legacyParsed = { raw: legacyRaw }; }
        
        if (legacyRes.ok && (Array.isArray(legacyParsed?.templates) || Array.isArray(legacyParsed?.data))) {
          res = legacyRes;
          raw = legacyRaw;
          parsed = legacyParsed;
          console.log("[GUPSHUP-TEMPLATES] Legacy fallback succeeded!");
        } else {
          console.error("[GUPSHUP-TEMPLATES] Legacy fallback also failed:", legacyRes.status, legacyParsed);
        }
      } catch (fallbackErr) {
        console.error("[GUPSHUP-TEMPLATES] Exception during legacy fallback:", fallbackErr);
      }
    }

    if (!res.ok) {
      console.error("[GUPSHUP-TEMPLATES] Both endpoints failed. Main error:", res.status, parsed);
      return new Response(JSON.stringify({
        templates: [],
        reason: "gupshup_error",
        http_status: res.status,
        gupshup: parsed,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const list: any[] = Array.isArray(parsed?.templates)
      ? parsed.templates
      : Array.isArray(parsed?.data)
      ? parsed.data
      : [];

    const normalized = list
      .map(normalizeTemplate)
      .filter((t) => t.id && (t.status || "").toUpperCase() === "APPROVED")
      .sort((a, b) => (a.elementName || "").localeCompare(b.elementName || ""));

    const payload = { templates: normalized, appName, appId, count: normalized.length };
    CACHE = { ts: Date.now(), data: payload };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GUPSHUP-TEMPLATES] exception", err);
    return new Response(JSON.stringify({
      templates: [],
      reason: "exception",
      error: err instanceof Error ? err.message : String(err),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
