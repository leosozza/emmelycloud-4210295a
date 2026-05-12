// deno-lint-ignore-file no-explicit-any
// Reverse-resolves WhatsApp LID → phone number using WUZAPI /user/contacts + /user/lid/{phone}.
// Strategy:
//   1) Pull all WUZAPI contacts (returns map keyed by phone JID).
//   2) For each phone JID, call /user/lid/{phone} to obtain its LID.
//   3) Build phone↔LID map.
//   4) Update conversations where contact_phone IS NULL but contact_lid matches.
//
// This is the only viable LID→phone backfill: Meta privacy blocks reverse lookup
// directly, but if the contact is saved/known by the connected WhatsApp account,
// the forward map exposes the correspondence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional ?dry_run=1 to preview without writing
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";

    // ── 1) WUZAPI credentials ───────────────────────────────────────────────
    const { data: creds } = await supabase
      .from("integration_credentials")
      .select("credential_key, credential_value")
      .eq("provider", "wuzapi");

    let baseUrl = "";
    let token = "";
    for (const c of creds || []) {
      if (c.credential_key === "WUZAPI_BASE_URL" && !baseUrl) baseUrl = (c.credential_value || "").trim();
      if (c.credential_key === "WUZAPI_USER_TOKEN" && !token) token = (c.credential_value || "").trim();
    }
    if (!baseUrl || !token) throw new Error("WUZAPI credentials not configured");
    baseUrl = baseUrl.replace(/\/+$/, "");

    // ── 2) Fetch contacts ───────────────────────────────────────────────────
    const cRes = await fetch(`${baseUrl}/user/contacts`, {
      method: "GET",
      headers: { "Content-Type": "application/json", token },
    });
    if (!cRes.ok) throw new Error(`/user/contacts failed: ${cRes.status} ${await cRes.text()}`);
    const cJson: any = await cRes.json();
    const contactMap: Record<string, any> = cJson?.data || {};
    const phoneJids = Object.keys(contactMap).filter((j) => j.includes("@s.whatsapp.net"));
    console.log(`[BACKFILL] Loaded ${phoneJids.length} contacts from WUZAPI`);

    // ── 3) Load LID-only conversations ──────────────────────────────────────
    const { data: lidConvs, error: lErr } = await supabase
      .from("conversations")
      .select("id, contact_lid, contact_name")
      .eq("channel", "whatsapp")
      .is("contact_phone", null)
      .not("contact_lid", "is", null);
    if (lErr) throw lErr;
    const lidSet = new Set((lidConvs || []).map((c) => String(c.contact_lid).replace(/@.*$/, "")));
    console.log(`[BACKFILL] ${lidConvs?.length || 0} LID-only conversations to resolve`);

    if (lidSet.size === 0) {
      return new Response(JSON.stringify({ ok: true, resolved: 0, message: "Nothing to backfill" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4) For each contact phone, ask /user/lid/{phone} ────────────────────
    const phoneToLid = new Map<string, string>();
    let probed = 0;
    let matched = 0;

    // Concurrency-limited loop to avoid hammering WUZAPI
    const batchSize = 8;
    for (let i = 0; i < phoneJids.length; i += batchSize) {
      const batch = phoneJids.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (jid) => {
          const phone = jid.replace(/@.*$/, "").replace(/[^0-9]/g, "");
          if (!phone) return;
          try {
            const r = await fetch(`${baseUrl}/user/lid/${phone}`, {
              method: "GET",
              headers: { "Content-Type": "application/json", token },
            });
            probed++;
            if (!r.ok) return;
            const j: any = await r.json().catch(() => ({}));
            const lidRaw: string = j?.data?.lid || j?.lid || j?.data?.LID || "";
            const lid = String(lidRaw).replace(/@.*$/, "");
            if (lid && lidSet.has(lid)) {
              phoneToLid.set(lid, phone);
              matched++;
            }
          } catch (_e) { /* ignore single failures */ }
        })
      );
    }

    console.log(`[BACKFILL] Probed ${probed} phones, matched ${matched} LIDs`);

    // ── 5) Update conversations ─────────────────────────────────────────────
    const updates: { id: string; phone: string; lid: string; name?: string | null }[] = [];
    for (const conv of lidConvs || []) {
      const lid = String(conv.contact_lid).replace(/@.*$/, "");
      const phone = phoneToLid.get(lid);
      if (phone) {
        const contactInfo = contactMap[`${phone}@s.whatsapp.net`] || {};
        const newName = contactInfo.FullName || contactInfo.PushName || contactInfo.FirstName || null;
        updates.push({ id: conv.id, phone, lid, name: newName });
      }
    }

    if (!dryRun) {
      for (const u of updates) {
        await supabase
          .from("conversations")
          .update({
            contact_phone: u.phone,
            ...(u.name ? { contact_name: u.name } : {}),
          })
          .eq("id", u.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        contacts_in_wuzapi: phoneJids.length,
        lid_only_conversations: lidConvs?.length || 0,
        resolved: updates.length,
        unresolved: (lidConvs?.length || 0) - updates.length,
        sample: updates.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[BACKFILL] Error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
