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
    const results: Record<string, unknown> = {};

    // ── 1. Check Callbell API Token ──────────────────────────────────────
    const callbellToken = Deno.env.get("CALLBELL_API_TOKEN");
    const callbellIgUuid = Deno.env.get("CALLBELL_IG_CHANNEL_UUID");

    if (!callbellToken) {
      results.callbell = { ok: false, error: "CALLBELL_API_TOKEN não configurado." };
    } else {
      // Test Callbell connectivity by listing channels
      try {
        const cbRes = await fetch("https://api.callbell.eu/v1/channels", {
          headers: { Authorization: `Bearer ${callbellToken}` },
        });
        const cbBody = await cbRes.text();
        if (cbRes.ok) {
          const cbData = JSON.parse(cbBody);
          const channels = cbData?.channels || cbData?.data || [];
          const igChannel = Array.isArray(channels)
            ? channels.find(
                (c: any) =>
                  c.uuid === callbellIgUuid ||
                  c.platform === "instagram" ||
                  c.name?.toLowerCase().includes("instagram")
              )
            : null;
          results.callbell = {
            ok: true,
            message: "API Callbell operacional.",
            ig_channel_uuid: callbellIgUuid || "não configurado",
            ig_channel_found: !!igChannel,
            total_channels: Array.isArray(channels) ? channels.length : 0,
          };
        } else {
          results.callbell = { ok: false, error: `Callbell API retornou ${cbRes.status}: ${cbBody.substring(0, 200)}` };
        }
      } catch (e) {
        results.callbell = { ok: false, error: `Erro de rede Callbell: ${(e as Error).message}` };
      }
    }

    // ── 2. Check Meta Graph API Token ────────────────────────────────────
    const metaToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
    const metaIgId = Deno.env.get("META_IG_ACCOUNT_ID");

    if (!metaToken) {
      results.meta = { ok: false, error: "META_PAGE_ACCESS_TOKEN não configurado." };
    } else {
      try {
        // Test token validity with a simple "me" call
        const meRes = await fetch(
          `https://graph.instagram.com/v22.0/me?fields=id,username&access_token=${metaToken}`
        );
        const meBody = await meRes.text();
        if (meRes.ok) {
          const meData = JSON.parse(meBody);
          results.meta = {
            ok: true,
            message: "Token Meta/Instagram válido.",
            ig_account_id: metaIgId || "não configurado",
            username: meData.username || meData.id,
          };
        } else {
          let errorMsg = `Meta API retornou ${meRes.status}`;
          try {
            const errData = JSON.parse(meBody);
            if (errData.error) {
              errorMsg = `${errData.error.type || "Error"} (code ${errData.error.code}): ${errData.error.message}`;
            }
          } catch { /* ignore parse error */ }
          results.meta = { ok: false, error: errorMsg };
        }
      } catch (e) {
        results.meta = { ok: false, error: `Erro de rede Meta: ${(e as Error).message}` };
      }
    }

    // ── 3. Summary ───────────────────────────────────────────────────────
    const callbellOk = (results.callbell as any)?.ok === true;
    const metaOk = (results.meta as any)?.ok === true;
    const allOk = callbellOk && metaOk;

    return new Response(
      JSON.stringify({
        ok: allOk,
        message: allOk
          ? "Todas as conexões Instagram estão operacionais!"
          : "Alguns serviços apresentam problemas.",
        callbell: results.callbell,
        meta: results.meta,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
