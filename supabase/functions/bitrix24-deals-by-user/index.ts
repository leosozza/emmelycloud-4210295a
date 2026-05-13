// Returns Bitrix24 deal IDs assigned to a given user.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { user_id, date_from, date_to } = await req.json().catch(() => ({}));
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: integration } = await supabase
      .from("bitrix24_integrations").select("*")
      .order("updated_at", { ascending: false }).limit(1).single();
    if (!integration?.client_endpoint || !integration?.access_token) {
      return new Response(JSON.stringify({ error: "no integration" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callBitrix = async (auth: string, start: number) => {
      const params = new URLSearchParams();
      params.set("auth", auth);
      params.set("start", String(start));
      params.set("filter[ASSIGNED_BY_ID]", String(user_id));
      if (date_from) params.set("filter[>=DATE_CREATE]", date_from);
      if (date_to) params.set("filter[<=DATE_CREATE]", date_to);
      params.append("select[]", "ID");
      const r = await fetch(`${integration.client_endpoint}crm.deal.list?${params.toString()}`);
      return r.json();
    };

    let auth = integration.access_token;
    const dealIds: string[] = [];
    let start = 0;
    let safety = 0;
    while (safety++ < 200) {
      let data = await callBitrix(auth, start);
      if (data.error === "expired_token" || data.error === "WRONG_TOKEN") {
        const ref = await fetch(
          `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${Deno.env.get("BITRIX24_CLIENT_ID")}&client_secret=${Deno.env.get("BITRIX24_CLIENT_SECRET")}&refresh_token=${integration.refresh_token}`,
        );
        const rj = await ref.json();
        if (!rj.access_token) break;
        auth = rj.access_token;
        await supabase.from("bitrix24_integrations").update({
          access_token: rj.access_token,
          refresh_token: rj.refresh_token,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        }).eq("id", integration.id);
        data = await callBitrix(auth, start);
      }
      if (!data.result) break;
      for (const d of data.result) dealIds.push(String(d.ID));
      if (typeof data.next === "number") start = data.next; else break;
    }

    return new Response(JSON.stringify({ deal_ids: dealIds, total: dealIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
