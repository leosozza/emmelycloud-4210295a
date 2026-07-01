// Generic Bizproc robot endpoint for Asaas actions.
// Bitrix calls this when a deal hits a stage with one of the configured robots.
// Robot codes:
//   ASAAS_CHARGE   -> creates a one-off Asaas payment (delegates to payment-create)
//   ASAAS_SUB      -> creates an Asaas subscription
//   ASAAS_NFSE     -> issues NFSe for the latest paid transaction on the deal

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getParam(form: URLSearchParams, key: string): string | null {
  return form.get(key) || form.get(key.toLowerCase()) || null;
}

async function callInternal(path: string, payload: any): Promise<any> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`internal call ${path}: ${JSON.stringify(data)}`);
  return data;
}

async function sendBizprocReturn(
  clientEndpoint: string,
  authToken: string,
  eventToken: string,
  returnValues: Record<string, any>,
) {
  if (!eventToken) return;
  const base = clientEndpoint.endsWith("/") ? clientEndpoint : clientEndpoint + "/";
  await fetch(`${base}bizproc.event.send.json?auth=${authToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_token: eventToken, return_values: returnValues }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const robotCode = url.searchParams.get("code") || ""; // ASAAS_CHARGE | ASAAS_SUB | ASAAS_NFSE
    const contentType = req.headers.get("content-type") || "";

    let form: URLSearchParams;
    if (contentType.includes("application/json")) {
      const j = await req.json();
      form = new URLSearchParams();
      for (const [k, v] of Object.entries(j)) form.set(k, String(v));
    } else {
      form = new URLSearchParams(await req.text());
    }

    const eventToken = getParam(form, "event_token") || "";
    const dealId = getParam(form, "document_id[2]") || getParam(form, "properties[deal_id]") || getParam(form, "deal_id") || "";
    const dealIdNum = dealId.replace(/^DEAL_/, "");

    const value = parseFloat(getParam(form, "properties[value]") || getParam(form, "value") || "0");
    const billingType = getParam(form, "properties[billing_type]") || "PIX";
    const description = getParam(form, "properties[description]") || `Cobrança Deal ${dealIdNum}`;
    const cycle = getParam(form, "properties[cycle]") || "MONTHLY";

    const authToken = getParam(form, "auth[access_token]") || "";

    // resolve company + integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("client_endpoint")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const clientEndpoint = integration?.client_endpoint || "";

    let result: any = null;

    if (robotCode === "ASAAS_CHARGE") {
      // NEW: prefer routing through bitrix24-robot-handler create_charge, which
      // reads the Emmely Pay plan (entrada + parcelas) from the deal fields.
      // Falls back to legacy single-charge behavior when no deal_id is present.
      if (dealIdNum) {
        result = await callInternal("bitrix24-robot-handler", {
          code: "create_charge",
          properties: {
            deal_id: dealIdNum,
            // Optional overrides (empty ⇒ ignored)
            amount: value || undefined,
            payment_method: billingType ? (billingType.toLowerCase() === "boleto" ? "boleto" : (billingType.toLowerCase() === "credit_card" ? "card" : (billingType.toLowerCase() === "pix" ? "pix" : billingType.toLowerCase()))) : undefined,
            description: description || undefined,
          },
          auth: { access_token: authToken },
        });
      } else {
        result = await callInternal("payment-create", {
          gateway: "asaas",
          amount: value,
          currency: "BRL",
          payment_method: billingType.toLowerCase() === "boleto" ? "boleto" : (billingType.toLowerCase() === "credit_card" ? "card" : "pix"),
          description,
          metadata: { bitrix_deal_id: dealIdNum, source: "bizproc_robot" },
        });
      }
    } else if (robotCode === "ASAAS_SUB") {
      result = await callInternal("asaas-subscription-create", {
        bitrix24_deal_id: dealIdNum,
        value,
        cycle,
        billing_type: billingType,
        description,
        customer: {
          name: getParam(form, "properties[customer_name]") || undefined,
          email: getParam(form, "properties[customer_email]") || undefined,
          cpf_cnpj: getParam(form, "properties[customer_cpfcnpj]") || undefined,
          phone: getParam(form, "properties[customer_phone]") || undefined,
        },
      });
    } else if (robotCode === "ASAAS_NFSE") {
      const { data: tx } = await supabase
        .from("payment_transactions")
        .select("id, gateway_payment_id, amount, metadata")
        .eq("gateway", "asaas")
        .filter("metadata->>bitrix_deal_id", "eq", dealIdNum)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!tx) throw new Error(`No asaas transaction for deal ${dealIdNum}`);
      result = await callInternal("asaas-nfse-issue", {
        payment_transaction_id: tx.id,
        service_description: description,
        value: value || tx.amount,
        municipal_service_code: getParam(form, "properties[municipal_service_code]") || undefined,
      });
    } else {
      throw new Error(`Unknown robot code: ${robotCode}`);
    }

    if (eventToken && clientEndpoint && authToken) {
      await sendBizprocReturn(clientEndpoint, authToken, eventToken, {
        status: "ok",
        payment_url:
          result?.transaction?.payment_url ||
          result?.payment_url ||
          result?.asaas?.invoiceUrl ||
          "",
      });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[bitrix24-robot-asaas]", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
