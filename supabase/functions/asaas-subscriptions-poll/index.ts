// Cron-driven reconciliation: walks active asaas_subscriptions, pulls latest
// status from Asaas and refreshes local row. Fallback in case webhooks are lost.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeAsaasClient, getAsaasCredentialsFromSupabase } from "../_shared/asaas-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subs, error } = await supabase
    .from("asaas_subscriptions")
    .select("*")
    .in("status", ["ACTIVE", "EXPIRED"])
    .order("updated_at", { ascending: true })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  let failed = 0;
  for (const sub of subs || []) {
    try {
      const creds = await getAsaasCredentialsFromSupabase(supabase, sub.company_id);
      if (!creds) continue;
      const client = makeAsaasClient(creds.apiKey, creds.env);
      const remote = await client.getSubscription(sub.asaas_subscription_id);
      await supabase
        .from("asaas_subscriptions")
        .update({
          status: remote.status || sub.status,
          next_due_date: remote.nextDueDate || sub.next_due_date,
          end_date: remote.endDate || sub.end_date,
          metadata: { ...(sub.metadata || {}), last_poll: remote },
        })
        .eq("id", sub.id);
      updated++;
    } catch (e) {
      failed++;
      console.error("[poll] subscription", sub.id, e);
    }
  }

  return new Response(
    JSON.stringify({ checked: (subs || []).length, updated, failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
