// Post/update Bitrix24 timeline comment reflecting WhatsApp message status.
// Input: { message_id: string, event: "sent" | "delivered" | "read" | "failed", error?: string }
// Behavior: creates a single timeline comment per message and updates it in place
// when subsequent status events arrive (delivered/read/failed).
//
// Docs:
//   https://apidocs.bitrix24.com/api-reference/crm/timeline/comments/crm-timeline-comment-add.html
//   https://apidocs.bitrix24.com/api-reference/crm/timeline/comments/crm-timeline-comment-update.html
//   https://apidocs.bitrix24.com/api-reference/crm/duplicates/crm-duplicate-find-by-comm.html
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MsgEvent = "sent" | "delivered" | "read" | "failed";

async function callBitrix(endpoint: string, token: string, method: string, params: Record<string, any> = {}) {
  const url = `${endpoint.endsWith("/") ? endpoint : endpoint + "/"}${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: token }),
  });
  return await res.json();
}

async function refreshToken(supabase: any, integration: any): Promise<string> {
  const clientId = Deno.env.get("BITRIX24_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("BITRIX24_CLIENT_SECRET") || "";
  if (!integration.refresh_token) return integration.access_token;
  const url = `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${integration.refresh_token}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d?.access_token) {
    await supabase.from("bitrix24_integrations").update({
      access_token: d.access_token,
      refresh_token: d.refresh_token || integration.refresh_token,
      expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
    }).eq("id", integration.id);
    integration.access_token = d.access_token;
    return d.access_token;
  }
  return integration.access_token;
}

async function callWithRefresh(supabase: any, integration: any, method: string, params: Record<string, any> = {}) {
  let res = await callBitrix(integration.client_endpoint, integration.access_token, method, params);
  if (res?.error === "expired_token" || res?.error === "WRONG_TOKEN") {
    const tk = await refreshToken(supabase, integration);
    res = await callBitrix(integration.client_endpoint, tk, method, params);
  }
  return res;
}

function fmtTime(d = new Date()) {
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function preview(text: string, max = 140): string {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (!s) return "(sem texto)";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function buildCommentText(msg: any, event: MsgEvent, error?: string): string {
  const body = preview(msg.content || "");
  const media = msg.media_type ? ` [${msg.media_type}]` : "";
  const header = `📤 WhatsApp${media} — «${body}»`;
  const status =
    event === "sent" ? `Enviada às ${fmtTime()}`
    : event === "delivered" ? `✅ Entregue às ${fmtTime()}`
    : event === "read" ? `👁 Lida às ${fmtTime()}`
    : `❌ Falha às ${fmtTime()}${error ? ` — ${error}` : ""}`;
  return `${header}\n${status}`;
}

async function resolveEntity(
  supabase: any,
  integration: any,
  msg: any,
): Promise<{ typeId: number; id: number; ref: string } | null> {
  // 1) already cached on message
  if (msg.bitrix_entity_ref) {
    const [t, i] = String(msg.bitrix_entity_ref).split(":");
    const typeId = parseInt(t);
    const id = parseInt(i);
    if (typeId && id) return { typeId, id, ref: msg.bitrix_entity_ref };
  }

  // 2) conversation.bot_state
  const { data: conv } = await supabase
    .from("conversations")
    .select("bot_state, contact_phone")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  const botState = (conv?.bot_state as any) || {};
  if (botState.bitrix_entity_id) {
    const parts = String(botState.bitrix_entity_id).split(":");
    let typeId = 1, id = 0;
    if (parts.length === 2) { typeId = parseInt(parts[0]) || 1; id = parseInt(parts[1]) || 0; }
    else { id = parseInt(parts[0]) || 0; }
    if (id) {
      const ref = `${typeId}:${id}`;
      await supabase.from("messages").update({ bitrix_entity_ref: ref }).eq("id", msg.id);
      return { typeId, id, ref };
    }
  }
  if (botState.bitrix_deal_id) {
    const id = parseInt(String(botState.bitrix_deal_id));
    if (id) {
      const ref = `2:${id}`;
      await supabase.from("messages").update({ bitrix_entity_ref: ref }).eq("id", msg.id);
      return { typeId: 2, id, ref };
    }
  }

  // 3) findbycomm by phone
  const phone = String(conv?.contact_phone || "").replace(/\D/g, "");
  if (phone.length >= 8) {
    const r = await callWithRefresh(supabase, integration, "crm.duplicate.findbycomm", {
      type: "PHONE", values: [phone],
    });
    const result = r?.result || {};
    let typeId = 0, id = 0;
    if (Array.isArray(result.DEAL) && result.DEAL.length) { typeId = 2; id = parseInt(result.DEAL[0]); }
    else if (Array.isArray(result.LEAD) && result.LEAD.length) { typeId = 1; id = parseInt(result.LEAD[0]); }
    else if (Array.isArray(result.CONTACT) && result.CONTACT.length) { typeId = 3; id = parseInt(result.CONTACT[0]); }
    if (id) {
      const ref = `${typeId}:${id}`;
      await supabase.from("messages").update({ bitrix_entity_ref: ref }).eq("id", msg.id);
      const newBotState = { ...botState, bitrix_entity_id: ref };
      await supabase.from("conversations").update({ bot_state: newBotState }).eq("id", msg.conversation_id);
      return { typeId, id, ref };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { message_id, event, error } = body as { message_id: string; event: MsgEvent; error?: string };
    if (!message_id || !event) {
      return new Response(JSON.stringify({ error: "message_id and event are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: msg } = await supabase
      .from("messages")
      .select("id, conversation_id, content, media_type, direction, bitrix_timeline_comment_id, bitrix_entity_ref")
      .eq("id", message_id)
      .maybeSingle();

    if (!msg) {
      return new Response(JSON.stringify({ ok: true, skipped: "message not found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg.direction !== "outbound") {
      return new Response(JSON.stringify({ ok: true, skipped: "inbound message" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!integration?.client_endpoint) {
      return new Response(JSON.stringify({ ok: true, skipped: "no bitrix integration" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entity = await resolveEntity(supabase, integration, msg);
    if (!entity) {
      return new Response(JSON.stringify({ ok: true, skipped: "no CRM entity" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const commentText = buildCommentText(msg, event, error);

    if (msg.bitrix_timeline_comment_id) {
      // Update in place
      const upd = await callWithRefresh(supabase, integration, "crm.timeline.comment.update", {
        id: msg.bitrix_timeline_comment_id,
        fields: { COMMENT: commentText },
      });
      if (!upd?.error) {
        return new Response(JSON.stringify({ ok: true, updated: msg.bitrix_timeline_comment_id }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn("[MSG-TIMELINE] comment.update failed, falling back to add:", upd?.error);
    }

    // Create new comment
    const add = await callWithRefresh(supabase, integration, "crm.timeline.comment.add", {
      fields: {
        ENTITY_ID: entity.id,
        ENTITY_TYPE:
          entity.typeId === 2 ? "deal" :
          entity.typeId === 1 ? "lead" :
          entity.typeId === 3 ? "contact" :
          entity.typeId === 4 ? "company" : "deal",
        COMMENT: commentText,
      },
    });

    const newId = add?.result;
    if (newId) {
      await supabase.from("messages")
        .update({ bitrix_timeline_comment_id: Number(newId) })
        .eq("id", message_id);
      return new Response(JSON.stringify({ ok: true, created: newId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: add?.error || "unknown", raw: add }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[MSG-TIMELINE] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
