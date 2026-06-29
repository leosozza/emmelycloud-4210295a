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
      payment_transaction_id,
      asaas_subscription_uuid, // local id
      asaas_payment_id, // direct
      service_description,
      value,
      effective_date,
      municipal_service_code,
      municipal_service_id,
      deductions = 0,
      tax_breakdown,
      customer_info,
    } = body || {};

    if (!service_description || !value) {
      return new Response(JSON.stringify({ error: "service_description and value required" }), {
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

    // resolve asaas_payment_id from transaction if not given
    let resolvedPaymentId = asaas_payment_id as string | undefined;
    let resolvedTransactionId = payment_transaction_id as string | undefined;
    if (!resolvedPaymentId && payment_transaction_id) {
      const { data: tx } = await supabase
        .from("payment_transactions")
        .select("gateway_payment_id")
        .eq("id", payment_transaction_id)
        .maybeSingle();
      resolvedPaymentId = tx?.gateway_payment_id;
    }

    let resolvedSubscriptionLocalId: string | null = null;
    if (asaas_subscription_uuid) resolvedSubscriptionLocalId = asaas_subscription_uuid;

    if (!resolvedPaymentId) {
      return new Response(JSON.stringify({ error: "asaas_payment_id could not be resolved" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const created = await client.createInvoice({
      payment: resolvedPaymentId,
      serviceDescription: service_description,
      value,
      deductions,
      effectiveDate: effective_date || new Date().toISOString().split("T")[0],
      municipalServiceCode: municipal_service_code || undefined,
      municipalServiceId: municipal_service_id || undefined,
      taxes: tax_breakdown || undefined,
      customer: customer_info || undefined,
    });

    const { data: row, error: insertErr } = await supabase
      .from("asaas_invoices")
      .insert({
        payment_transaction_id: resolvedTransactionId || null,
        asaas_subscription_id: resolvedSubscriptionLocalId,
        company_id: company_id || null,
        asaas_invoice_id: created.id,
        asaas_payment_id: resolvedPaymentId,
        status: created.status || "SCHEDULED",
        pdf_url: created.pdfUrl || null,
        xml_url: created.xmlUrl || null,
        number: created.number || null,
        service_description,
        value,
        effective_date: created.effectiveDate || effective_date || null,
        municipal_service_code: municipal_service_code || null,
        metadata: { asaas: created, request: body },
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ invoice: row, asaas: created }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[asaas-nfse-issue]", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err), body: err.body }),
      { status: err.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
