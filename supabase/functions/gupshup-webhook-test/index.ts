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

  // Load secret
  const { data: secretRow } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", "gupshup")
    .eq("credential_key", "GUPSHUP_WEBHOOK_SECRET")
    .maybeSingle();
  const secret = (secretRow?.credential_value || "").trim();

  // 2. Assinatura HMAC
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

  if (!secret) {
    checks.push({
      id: "signature", label: "Assinatura HMAC",
      status: "warn",
      message: "Webhook desprotegido — defina GUPSHUP_WEBHOOK_SECRET para validar HMAC SHA-256.",
    });
  } else {
    try {
      const goodSig = await hmacHex(rawBody, secret);
      const okRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gupshup-signature": `sha256=${goodSig}` },
        body: rawBody,
      });
      const okText = await okRes.text();

      const badRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gupshup-signature": "sha256=deadbeef" },
        body: rawBody,
      });
      const badText = await badRes.text();

      const passed = okRes.ok && badRes.status === 401;
      checks.push({
        id: "signature", label: "Assinatura HMAC",
        status: passed ? "ok" : "fail",
        message: passed
          ? "Assinatura válida aceita (200) e inválida rejeitada (401)."
          : `Comportamento inesperado: válida=${okRes.status}, inválida=${badRes.status}`,
        detail: `POST válido → ${okRes.status} ${okText.slice(0, 120)}\nPOST inválido → ${badRes.status} ${badText.slice(0, 120)}`,
      });
    } catch (e) {
      checks.push({
        id: "signature", label: "Assinatura HMAC", status: "fail",
        message: "Falha ao testar assinatura",
        detail: String(e),
      });
    }
  }

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
