import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth: require a logged-in user (JWT) — verify via getClaims
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const checks: Array<{ id: string; label: string; status: "ok" | "warn" | "fail"; message: string; detail?: string }> = [];

  // Load all Gupshup credentials
  const { data: credRows } = await supabase
    .from("integration_credentials")
    .select("credential_key, credential_value")
    .eq("provider", "gupshup");
  const credsMap: Record<string, string> = {};
  (credRows || []).forEach((c: any) => {
    if (c.credential_key) credsMap[c.credential_key] = (c.credential_value || "").trim();
  });

  const apiKey = credsMap.GUPSHUP_API_KEY || "";
  const appName = credsMap.GUPSHUP_APP_NAME || "";
  const sourceNumber = (credsMap.GUPSHUP_SOURCE_NUMBER || "").replace(/[^0-9]/g, "");
  const appId = credsMap.GUPSHUP_APP_ID || "";

  // Check 1: Configuração das credenciais no banco de dados
  const missing = [];
  if (!apiKey) missing.push("API Key (GUPSHUP_API_KEY)");
  if (!appName) missing.push("App Name (GUPSHUP_APP_NAME)");
  if (!sourceNumber) missing.push("Source Number (GUPSHUP_SOURCE_NUMBER)");

  if (missing.length > 0) {
    checks.push({
      id: "creds_configured",
      label: "Credenciais Gupshup configuradas",
      status: "fail",
      message: `Faltam credenciais obrigatórias no banco: ${missing.join(", ")}.`,
    });
  } else {
    const isNumeric = /^[0-9]+$/.test(sourceNumber);
    if (!isNumeric || sourceNumber.length < 8) {
      checks.push({
        id: "creds_configured",
        label: "Credenciais Gupshup configuradas",
        status: "fail",
        message: `Source Number inválido (${sourceNumber || "vazio"}). Deve conter apenas dígitos no formato E.164 (ex: 5511999999999).`,
      });
    } else {
      checks.push({
        id: "creds_configured",
        label: "Credenciais Gupshup configuradas",
        status: "ok",
        message: `Credenciais estruturadas corretamente. App Name: "${appName}", Source Number: ${sourceNumber}.`,
      });
    }
  }

  // Check 2: Validação com a API oficial do Gupshup
  if (apiKey && appName) {
    if (!appId) {
      checks.push({
        id: "gupshup_api_connection",
        label: "Validação Gupshup API",
        status: "warn",
        message: "O App ID não está configurado. A validação direta de credenciais e listagem de templates HSM foram ignoradas. (Para ativar, adicione o App ID UUID na aba Integrações).",
      });
    } else {
      try {
        const gsUrl = `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`;
        const res = await fetch(gsUrl, {
          method: "GET",
          headers: {
            "apikey": apiKey,
            "accept": "application/json",
          }
        });

        const rawText = await res.text();
        let parsed: any = {};
        try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText }; }

        // Adicionalmente, busca os detalhes da aplicação para apoiar o diagnóstico de erros de digitação/DDI/9º dígito.
        let businessDetails = "";
        try {
          const bizUrl = `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/business`;
          const bizRes = await fetch(bizUrl, {
            method: "GET",
            headers: {
              "apikey": apiKey,
              "accept": "application/json",
            }
          });
          if (bizRes.ok) {
            businessDetails = await bizRes.text();
          } else {
            businessDetails = `HTTP ${bizRes.status}: ${await bizRes.text()}`;
          }
        } catch (bizErr) {
          businessDetails = `Erro ao buscar perfil de negócios: ${bizErr instanceof Error ? bizErr.message : String(bizErr)}`;
        }

        if (res.ok) {
          checks.push({
            id: "gupshup_api_connection",
            label: "Validação Gupshup API",
            status: "ok",
            message: "Conexão com a API do Gupshup estabelecida com sucesso. Credenciais e App ID válidos!",
            detail: `Gupshup Status: ${res.status}\n\n[Perfil de Negócio no Gupshup]:\n${businessDetails}\n\n[Resposta Templates]:\n${JSON.stringify(parsed).slice(0, 300)}`
          });
        } else {
          const gMsg = parsed?.message || parsed?.error?.message || rawText;
          checks.push({
            id: "gupshup_api_connection",
            label: "Validação Gupshup API",
            status: "fail",
            message: `Gupshup rejeitou as credenciais (status ${res.status}): ${gMsg}`,
            detail: `Response:\n${rawText}\n\n[Perfil de Negócio no Gupshup]:\n${businessDetails}`
          });
        }
      } catch (e) {
        checks.push({
          id: "gupshup_api_connection",
          label: "Validação Gupshup API",
          status: "fail",
          message: `Erro ao conectar com a API do Gupshup: ${e instanceof Error ? e.message : String(e)}`,
          detail: String(e)
        });
      }
    }
  }

  const webhookUrl = `${supabaseUrl}/functions/v1/gupshup-webhook`;

  // 1. Endpoint accessível (GET)
  try {
    const r = await fetch(webhookUrl, { method: "GET" });
    const body = await r.text();
    checks.push({
      id: "reachable",
      label: "Endpoint acessível",
      status: r.ok ? "ok" : "fail",
      message: r.ok ? `Webhook respondeu ${r.status}` : `Esperado 200, recebido ${r.status}`,
      detail: `GET ${webhookUrl}\n→ ${r.status} ${body.slice(0, 200)}`,
    });
  } catch (e) {
    checks.push({
      id: "reachable", label: "Endpoint acessível", status: "fail",
      message: "Não foi possível alcançar o webhook",
      detail: String(e),
    });
  }

  // Build test payload (HMAC signature removed — not used)
  const secret = "";
  const testId = `test-${crypto.randomUUID()}`;
  const testPayload = {
    app: "test",
    type: "message",
    payload: {
      id: testId,
      source: "5500000000000",
      type: "text",
      sender: { phone: "5500000000000", name: "Teste Gupshup" },
      payload: { text: `[Teste webhook ${new Date().toISOString()}]` },
      context: { test: true },
    },
  };
  const rawBody = JSON.stringify(testPayload);

  // If no secret, still send the test payload (unsigned) to verify persistence
  if (!secret) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawBody,
      });
    } catch { /* ignore */ }
  }

  // 3. Persistência — wait briefly then look up by external_id
  await new Promise((r) => setTimeout(r, 800));
  let persisted = false;
  try {
    const { data: msg } = await supabase
      .from("messages")
      .select("id, conversation_id")
      .eq("external_id", testId)
      .maybeSingle();
    persisted = !!msg;

    // Cleanup
    if (msg) {
      await supabase.from("notifications").delete().eq("entity_id", msg.conversation_id);
      await supabase.from("messages").delete().eq("id", msg.id);
      // delete the synthetic conversation if it has no other messages
      const { data: remaining } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", msg.conversation_id)
        .limit(1);
      if (!remaining || remaining.length === 0) {
        await supabase.from("conversations").delete().eq("id", msg.conversation_id);
      }
    }

    checks.push({
      id: "persistence", label: "Persistência da mensagem",
      status: persisted ? "ok" : "fail",
      message: persisted
        ? "Mensagem de teste gravada e limpa com sucesso."
        : `Mensagem de teste não encontrada (external_id=${testId}).`,
    });
  } catch (e) {
    checks.push({
      id: "persistence", label: "Persistência da mensagem", status: "fail",
      message: "Erro ao verificar persistência",
      detail: String(e),
    });
  }

  const passed = checks.every((c) => c.status !== "fail");

  return new Response(JSON.stringify({ ok: passed, checks, webhookUrl, hasSecret: !!secret }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
