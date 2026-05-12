// deno-lint-ignore-file no-explicit-any
// Links existing WhatsApp conversations to Bitrix24 entities by phone number.
// For each conversation with contact_phone but no bitrix_deal_id in bot_state:
//   1) Calls crm.duplicate.findbycomm with TYPE=PHONE
//   2) Picks the most recent open Deal (fallback: most recent Deal, then Contact, then Lead)
//   3) Writes bot_state.bitrix_deal_id / bitrix_contact_id / bitrix_lead_id / bitrix_entity_id
//
// Optional ?dry_run=1 returns the planned matches without writing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureValidToken(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return integration.access_token;
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh: ${data.error_description || data.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return data.access_token;
}

async function callBitrix(endpoint: string, token: string, method: string, params: any) {
  const url = endpoint.endsWith("/") ? endpoint : endpoint + "/";
  const res = await fetch(`${url}${method}.json?auth=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${method}: ${data.error_description || data.error}`);
  return data.result;
}

// Generate phone variants to try (BR mobile w/ and w/o 9th digit, +/no +)
function phoneVariants(raw: string): string[] {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  if (!digits) return [];
  const set = new Set<string>([digits, `+${digits}`]);
  // BR mobile: 55 + DDD(2) + 9 + 8 digits → also try without the 9
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    const without9 = digits.slice(0, 4) + digits.slice(5);
    set.add(without9);
    set.add(`+${without9}`);
  }
  // BR mobile w/o 9 → try with 9
  if (digits.startsWith("55") && digits.length === 12) {
    const with9 = digits.slice(0, 4) + "9" + digits.slice(4);
    set.add(with9);
    set.add(`+${with9}`);
  }
  return [...set];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    const limit = Number(url.searchParams.get("limit") || 500);

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!integration?.client_endpoint) throw new Error("No Bitrix24 integration found");
    const token = await ensureValidToken(supabase, integration);
    const endpoint = integration.client_endpoint;

    // Pull conversations needing linkage
    const { data: convs, error: cErr } = await supabase
      .from("conversations")
      .select("id, contact_phone, contact_name, bot_state")
      .eq("channel", "whatsapp")
      .not("contact_phone", "is", null)
      .limit(limit);
    if (cErr) throw cErr;

    const todo = (convs || []).filter((c: any) => !(c.bot_state && c.bot_state.bitrix_deal_id));
    console.log(`[BACKFILL-LINK] ${todo.length} conversations to process`);

    const results: any[] = [];
    let linked = 0;
    let unmatched = 0;

    for (const conv of todo) {
      const variants = phoneVariants(conv.contact_phone);
      let dealId: string | null = null;
      let contactId: string | null = null;
      let leadId: string | null = null;
      let matchedVariant: string | null = null;

      for (const v of variants) {
        try {
          const r: any = await callBitrix(endpoint, token, "crm.duplicate.findbycomm", {
            type: "PHONE",
            values: [v],
          });
          // r is shaped like { DEAL: [..], CONTACT: [..], LEAD: [..], COMPANY: [..] }
          const deals = Array.isArray(r?.DEAL) ? r.DEAL : [];
          const contacts = Array.isArray(r?.CONTACT) ? r.CONTACT : [];
          const leads = Array.isArray(r?.LEAD) ? r.LEAD : [];
          if (deals.length || contacts.length || leads.length) {
            matchedVariant = v;
            // Pick most recent deal (highest id)
            if (deals.length) dealId = String(deals.map(Number).sort((a: number, b: number) => b - a)[0]);
            if (contacts.length) contactId = String(contacts.map(Number).sort((a: number, b: number) => b - a)[0]);
            if (leads.length) leadId = String(leads.map(Number).sort((a: number, b: number) => b - a)[0]);

            // If no deal but we have a contact, try to find the contact's most recent deal
            if (!dealId && contactId) {
              try {
                const dealList: any = await callBitrix(endpoint, token, "crm.deal.list", {
                  filter: { CONTACT_ID: contactId },
                  select: ["ID"],
                  order: { ID: "DESC" },
                  start: 0,
                });
                if (Array.isArray(dealList) && dealList.length) {
                  dealId = String(dealList[0].ID);
                }
              } catch (_e) { /* ignore */ }
            }
            break;
          }
        } catch (e: any) {
          console.warn(`[BACKFILL-LINK] findbycomm failed for ${v}:`, e?.message);
        }
      }

      // Fallback 2: search by name (TITLE/NAME) when phone didn't match
      let matchedByName = false;
      if (!dealId && !contactId && !leadId && conv.contact_name && conv.contact_name.trim().length >= 3) {
        const name = conv.contact_name.trim();
        try {
          // Search Deals by TITLE
          const deals: any = await callBitrix(endpoint, token, "crm.deal.list", {
            filter: { "%TITLE": name },
            select: ["ID"],
            order: { ID: "DESC" },
            start: 0,
          });
          if (Array.isArray(deals) && deals.length && deals.length <= 5) {
            dealId = String(deals[0].ID);
            matchedByName = true;
          }
        } catch (_e) { /* ignore */ }

        if (!dealId) {
          try {
            const leads: any = await callBitrix(endpoint, token, "crm.lead.list", {
              filter: { "%TITLE": name },
              select: ["ID"],
              order: { ID: "DESC" },
              start: 0,
            });
            if (Array.isArray(leads) && leads.length && leads.length <= 5) {
              leadId = String(leads[0].ID);
              matchedByName = true;
            }
          } catch (_e) { /* ignore */ }
        }

        if (!dealId && !leadId) {
          try {
            const contacts: any = await callBitrix(endpoint, token, "crm.contact.list", {
              filter: { "%NAME": name },
              select: ["ID"],
              order: { ID: "DESC" },
              start: 0,
            });
            if (Array.isArray(contacts) && contacts.length && contacts.length <= 5) {
              contactId = String(contacts[0].ID);
              matchedByName = true;
            }
          } catch (_e) { /* ignore */ }
        }
      }

      if (!dealId && !contactId && !leadId) {
        unmatched++;
        results.push({ id: conv.id, phone: conv.contact_phone, name: conv.contact_name, matched: false });
        continue;
      }

      // Write phone back to Bitrix entity when matched by name (so future lookups work)
      if (matchedByName && conv.contact_phone && !dryRun) {
        const phoneField = [{ VALUE: conv.contact_phone, VALUE_TYPE: "MOBILE" }];
        try {
          if (dealId) {
            // Deals don't have PHONE directly; attach to its contact instead
            const deal: any = await callBitrix(endpoint, token, "crm.deal.get", { id: dealId });
            const cId = deal?.CONTACT_ID;
            if (cId) {
              await callBitrix(endpoint, token, "crm.contact.update", {
                id: cId,
                fields: { PHONE: phoneField },
              });
            }
          } else if (leadId) {
            await callBitrix(endpoint, token, "crm.lead.update", {
              id: leadId,
              fields: { PHONE: phoneField },
            });
          } else if (contactId) {
            await callBitrix(endpoint, token, "crm.contact.update", {
              id: contactId,
              fields: { PHONE: phoneField },
            });
          }
        } catch (e: any) {
          console.warn(`[BACKFILL-LINK] phone write-back failed:`, e?.message);
        }
      }

      const newBotState = { ...(conv.bot_state || {}) } as any;
      if (dealId) newBotState.bitrix_deal_id = dealId;
      if (contactId) newBotState.bitrix_contact_id = contactId;
      if (leadId) newBotState.bitrix_lead_id = leadId;
      if (dealId) newBotState.bitrix_entity_id = `2:${dealId}`;
      else if (contactId) newBotState.bitrix_entity_id = `3:${contactId}`;
      else if (leadId) newBotState.bitrix_entity_id = `1:${leadId}`;

      if (!dryRun) {
        await supabase.from("conversations").update({ bot_state: newBotState }).eq("id", conv.id);
      }
      linked++;
      results.push({
        id: conv.id,
        phone: conv.contact_phone,
        name: conv.contact_name,
        matched: true,
        match_type: matchedVariant ? "phone" : (matchedByName ? "name" : "unknown"),
        variant: matchedVariant,
        deal_id: dealId,
        contact_id: contactId,
        lead_id: leadId,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        processed: todo.length,
        linked,
        unmatched,
        sample: results.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[BACKFILL-LINK]", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
