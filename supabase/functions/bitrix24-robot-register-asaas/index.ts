// One-shot registrar that installs three Bizproc robots in the connected Bitrix24 portal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshIfNeeded(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) return integration.access_token;
  const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("BITRIX24_CLIENT_ID") || "",
      client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET") || "",
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`refresh: ${data.error_description || data.error}`);
  await supabase.from("bitrix24_integrations").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return data.access_token;
}

function handlerUrl(code: string): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/bitrix24-robot-asaas?code=${code}`;
}

const ROBOTS = [
  {
    CODE: "ASAAS_CHARGE",
    NAME: "Asaas: gerar cobrança",
    HANDLER: handlerUrl("ASAAS_CHARGE"),
    USE_SUBSCRIPTION: "N",
    PROPERTIES: {
      value: { Name: "Valor", Type: "double", Required: "Y" },
      billing_type: { Name: "Forma (PIX/BOLETO/CREDIT_CARD)", Type: "string", Default: "PIX" },
      description: { Name: "Descrição", Type: "string" },
    },
    RETURN_PROPERTIES: {
      status: { Name: "Status", Type: "string" },
      payment_url: { Name: "Link de pagamento", Type: "string" },
    },
  },
  {
    CODE: "ASAAS_SUB",
    NAME: "Asaas: criar assinatura",
    HANDLER: handlerUrl("ASAAS_SUB"),
    USE_SUBSCRIPTION: "N",
    PROPERTIES: {
      value: { Name: "Valor", Type: "double", Required: "Y" },
      billing_type: { Name: "Forma", Type: "string", Default: "PIX" },
      cycle: { Name: "Ciclo (MONTHLY/YEARLY/...)", Type: "string", Default: "MONTHLY" },
      description: { Name: "Descrição", Type: "string" },
      customer_name: { Name: "Cliente nome", Type: "string" },
      customer_email: { Name: "Cliente email", Type: "string" },
      customer_cpfcnpj: { Name: "Cliente CPF/CNPJ", Type: "string" },
      customer_phone: { Name: "Cliente telefone", Type: "string" },
    },
    RETURN_PROPERTIES: { status: { Name: "Status", Type: "string" } },
  },
  {
    CODE: "ASAAS_NFSE",
    NAME: "Asaas: emitir NFSe",
    HANDLER: handlerUrl("ASAAS_NFSE"),
    USE_SUBSCRIPTION: "N",
    PROPERTIES: {
      value: { Name: "Valor do serviço", Type: "double" },
      description: { Name: "Descrição do serviço", Type: "string", Required: "Y" },
      municipal_service_code: { Name: "Código serviço municipal", Type: "string" },
    },
    RETURN_PROPERTIES: { status: { Name: "Status", Type: "string" } },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!integration?.client_endpoint) {
      return new Response(JSON.stringify({ error: "No Bitrix24 integration" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const accessToken = await refreshIfNeeded(supabase, integration);
    const base = integration.client_endpoint.endsWith("/")
      ? integration.client_endpoint
      : integration.client_endpoint + "/";

    const results: any[] = [];
    for (const robot of ROBOTS) {
      const res = await fetch(`${base}bizproc.robot.add?auth=${accessToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(robot),
      });
      const data = await res.json();
      const ok = !data.error;
      if (ok) {
        await supabase
          .from("asaas_robot_registrations")
          .upsert({
            client_endpoint: integration.client_endpoint,
            robot_code: robot.CODE,
            metadata: { last_response: data },
          }, { onConflict: "client_endpoint,robot_code" });
      }
      results.push({ code: robot.CODE, ok, response: data });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[bitrix24-robot-register-asaas]", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
