import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeAsaasClient, getAsaasCredentialsFromSupabase } from "../_shared/asaas-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      company_id,
      proposal_id,
      client_id,
      bitrix24_deal_id,
      customer, // { name, email, cpf_cnpj, phone }
      value,
      cycle, // WEEKLY|BIWEEKLY|MONTHLY|BIMONTHLY|QUARTERLY|SEMIANNUALLY|YEARLY
      billing_type = "PIX",
      next_due_date, // YYYY-MM-DD optional
      end_date,
      description,
      max_payments,
      external_reference,
    } = body || {};

    if (!value || value <= 0) {
      return new Response(JSON.stringify({ error: "value > 0 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!cycle) {
      return new Response(JSON.stringify({ error: "cycle required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creds = await getAsaasCredentialsFromSupabase(supabase, company_id);
    if (!creds) {
      return new Response(JSON.stringify({ error: "Asaas API key not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = makeAsaasClient(creds.apiKey, creds.env);

    const asaasCustomerId = await client.ensureCustomer({
      name: customer?.name || "Cliente",
      email: customer?.email,
      cpfCnpj: customer?.cpf_cnpj,
      phone: customer?.phone,
      externalReference: external_reference || bitrix24_deal_id || proposal_id || undefined,
    });

    const due =
      next_due_date ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        return d.toISOString().split("T")[0];
      })();

    const created = await client.createSubscription({
      customer: asaasCustomerId,
      billingType: billing_type,
      value,
      nextDueDate: due,
      cycle,
      description: description || "Assinatura Emmely",
      endDate: end_date || undefined,
      maxPayments: max_payments || undefined,
      externalReference: external_reference || bitrix24_deal_id || proposal_id || undefined,
    });

    const { data: row, error: insertErr } = await supabase
      .from("asaas_subscriptions")
      .insert({
        company_id: company_id || null,
        proposal_id: proposal_id || null,
        client_id: client_id || null,
        bitrix24_deal_id: bitrix24_deal_id || null,
        asaas_subscription_id: created.id,
        asaas_customer_id: asaasCustomerId,
        billing_type,
        cycle,
        value,
        next_due_date: created.nextDueDate || due,
        end_date: end_date || null,
        description: description || null,
        status: created.status || "ACTIVE",
        metadata: { asaas: created, request: body },
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ subscription: row, asaas: created }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[asaas-subscription-create]", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err), body: err.body }),
      { status: err.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
