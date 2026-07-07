import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gupshup-signature",
};

async function verifyHmac(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const cleaned = signature.replace(/^sha256=/, "").toLowerCase();
  return hex === cleaned;
}

async function getWebhookSecret(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", "gupshup")
    .eq("credential_key", "GUPSHUP_WEBHOOK_SECRET")
    .maybeSingle();
  return (data?.credential_value || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET — handshake/health
  if (req.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // HMAC validation (skip if no secret configured — Gupshup allows optional)
    const secret = await getWebhookSecret(supabase);
    if (secret) {
      const signature = req.headers.get("x-gupshup-signature");
      const valid = await verifyHmac(rawBody, signature, secret);
      if (!valid) {
        console.warn("[GUPSHUP-WEBHOOK] Invalid signature");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    console.log("[GUPSHUP-WEBHOOK] type:", payload.type, "subtype:", payload.payload?.type);

    // Resolve channel instance (gupshup, active)
    let instance: any = null;
    {
      const { data: instances } = await supabase
        .from("channel_instances")
        .select("id, name, config, status")
        .eq("channel_type", "whatsapp")
        .eq("status", "active");
      instance = (instances || []).find((i: any) => (i.config as any)?.provider === "gupshup") || null;
    }

    // ── Delivery / status events ───────────────────────────────────────────
    if (payload.type === "message-event") {
      const evt = payload.payload || {};
      const gsId = evt.gsId || evt.id;
      const statusMap: Record<string, string> = {
        enqueued: "sent", sent: "sent", delivered: "delivered", read: "read",
        failed: "failed", mo_message: "received",
      };
      const status = statusMap[evt.type] || evt.type;
      if (evt.type === "failed") {
        console.log("[GUPSHUP-WEBHOOK] failure detail:", JSON.stringify(evt).slice(0, 800));
      }
      if (gsId && status) {
        const { data: updatedRows } = await supabase
          .from("messages")
          .update({ delivery_status: status })
          .eq("external_id", gsId)
          .select("id");
        const updatedId = updatedRows?.[0]?.id;
        if (updatedId && ["sent", "delivered", "read", "failed"].includes(status)) {
          try {
            fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bitrix24-post-message-timeline`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                message_id: updatedId,
                event: status,
                error: status === "failed" ? (evt.payload?.reason || evt.reason || "") : undefined,
              }),
            }).catch(() => {});
          } catch {}
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Eventos meta (opt-in/out, billing, template, system, account) ──────
    if (["user-event", "billing-event", "template-event", "account-event", "system-event"].includes(payload.type)) {
      console.log("[GUPSHUP-WEBHOOK] meta-event:", payload.type, JSON.stringify(payload.payload || {}).slice(0, 300));
      return new Response(JSON.stringify({ ok: true, acknowledged: payload.type }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Inbound user message
    if (payload.type === "message") {
      const p = payload.payload || {};
      const from = (p.source || p.sender?.phone || "").replace(/[^0-9]/g, "");
      const senderName = p.sender?.name || from;
      const gsId = p.id || payload.id;
      if (!from || !gsId) {
        return new Response(JSON.stringify({ ok: true, skipped: "missing from/id" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const inner = p.payload || {};
      let text = "";
      let mediaType = "";
      let mediaUrl = "";
      let interactiveResponse: any = null;

      switch (p.type) {
        case "text":
          text = inner.text || "";
          break;
        case "image":
          text = inner.caption || "[Imagem]"; mediaType = "image"; mediaUrl = inner.url || "";
          break;
        case "video":
          text = inner.caption || "[Vídeo]"; mediaType = "video"; mediaUrl = inner.url || "";
          break;
        case "audio":
        case "voice":
          text = "[Áudio]"; mediaType = "audio"; mediaUrl = inner.url || "";
          break;
        case "file":
          text = inner.caption || `[Documento: ${inner.filename || "ficheiro"}]`;
          mediaType = "document"; mediaUrl = inner.url || "";
          break;
        case "sticker":
          text = "[Sticker]"; mediaType = "sticker"; mediaUrl = inner.url || "";
          break;
        case "location":
          text = `[Localização: ${inner.latitude}, ${inner.longitude}]`; mediaType = "location";
          break;
        case "contact":
          text = `[Contacto]`; mediaType = "contact";
          break;
        case "button_reply":
        case "list_reply":
        case "quick_reply":
          text = inner.title || inner.text || "[Resposta interativa]";
          interactiveResponse = { button_reply: { id: inner.id || inner.postbackText, title: text } };
          break;
        default:
          text = `[${p.type || "desconhecido"}]`;
      }

      if (!text && !mediaUrl) {
        return new Response(JSON.stringify({ ok: true, skipped: "empty" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find or create conversation
      let conversationId: string;
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel", "whatsapp")
        .eq("contact_phone", from)
        .maybeSingle();

      if (existing) {
        conversationId = existing.id;
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from("conversations")
          .insert({ channel: "whatsapp", contact_name: senderName, contact_phone: from, status: "aberta" })
          .select("id").single();
        if (convErr || !newConv) {
          console.error("[GUPSHUP-WEBHOOK] create conversation:", convErr);
          return new Response(JSON.stringify({ ok: false }), { status: 500, headers: corsHeaders });
        }
        conversationId = newConv.id;
      }

      // Dedupe
      const { data: dup } = await supabase.from("messages").select("id").eq("external_id", gsId).maybeSingle();
      if (dup) {
        return new Response(JSON.stringify({ ok: true, deduped: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: "inbound",
        content: text,
        sender_name: senderName,
        external_id: gsId,
        media_type: mediaType || null,
        media_url: mediaUrl || null,
        sync_source: "gupshup",
      });
      if (msgErr) {
        console.error("[GUPSHUP-WEBHOOK] insert message failed:", msgErr, { conversationId, gsId });
        return new Response(JSON.stringify({ ok: false, error: "insert_message_failed", detail: msgErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[GUPSHUP-WEBHOOK] message persisted", { conversationId, gsId });

      const { error: convUpdErr } = await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text.slice(0, 100),
        unread_count: 1,
      }).eq("id", conversationId);
      if (convUpdErr) {
        console.error("[GUPSHUP-WEBHOOK] update conversation failed:", convUpdErr, { conversationId });
      }

      // Skip downstream (flow-engine / bitrix24) for test payloads
      const isTest = p?.context?.test === true;
      if (!isTest) {
        fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            conversation_id: conversationId,
            message_text: text,
            message_type: p.type,
            interactive_response: interactiveResponse,
            instance_id: instance?.id || null,
          }),
        }).catch((e) => console.error("[GUPSHUP-WEBHOOK] flow-engine:", e));

        fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            message: text,
            contactName: senderName,
            contactId: from,
            channel: "whatsapp",
            conversationId,
            instanceId: instance?.id || null,
            mediaUrl: mediaUrl || undefined,
            mediaType: mediaType || undefined,
            mediaFilename: (p.type === "file" ? inner.filename : undefined) || undefined,
          }),
        }).catch((e) => console.error("[GUPSHUP-WEBHOOK] bitrix24-send:", e));
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GUPSHUP-WEBHOOK] error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
