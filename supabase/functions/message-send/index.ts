import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IG_GRAPH_URL = "https://graph.instagram.com/v24.0";
const WA_GRAPH_URL = "https://graph.facebook.com/v22.0";

interface InstanceCredentials {
  accessToken: string;
  phoneNumberId?: string;
  igAccountId?: string;
  instanceName?: string;
}

/**
 * Resolve credentials for a channel from channel_instances table.
 * Falls back to environment variables if no active instance found.
 */
async function resolveCredentials(
  supabase: any,
  channel: string,
  instanceId?: string
): Promise<InstanceCredentials> {
  // Try to get from channel_instances
  let query = supabase
    .from("channel_instances")
    .select("id, name, config, status")
    .eq("channel_type", channel)
    .eq("status", "active");

  if (instanceId) {
    query = query.eq("id", instanceId);
  }

  const { data: instances } = await query.order("created_at").limit(1);
  const instance = instances?.[0];

  if (instance?.config) {
    const cfg = instance.config as Record<string, any>;

    if (channel === "whatsapp") {
      const token = cfg.access_token || cfg.wa_access_token;
      const phoneId = cfg.phone_number_id || cfg.wa_phone_number_id;
      if (token && phoneId) {
        console.log(`[MESSAGE-SEND] Using WhatsApp instance: ${instance.name} (${instance.id})`);
        return { accessToken: token, phoneNumberId: phoneId, instanceName: instance.name };
      }
    }

    if (channel === "instagram") {
      const token = cfg.access_token || cfg.ig_access_token;
      const accountId = cfg.ig_account_id;
      if (token && accountId) {
        console.log(`[MESSAGE-SEND] Using Instagram instance: ${instance.name} (${instance.id})`);
        return { accessToken: token, igAccountId: accountId, instanceName: instance.name };
      }
    }
  }

  // Fallback to environment variables
  console.log(`[MESSAGE-SEND] No active instance for ${channel}, falling back to env vars`);

  if (channel === "whatsapp") {
    return {
      accessToken: Deno.env.get("META_WA_ACCESS_TOKEN")?.trim() || "",
      phoneNumberId: Deno.env.get("META_WA_PHONE_NUMBER_ID")?.trim() || "",
      instanceName: "env-fallback",
    };
  }

  if (channel === "instagram") {
    return {
      accessToken: Deno.env.get("META_PAGE_ACCESS_TOKEN")?.trim().replace(/[\r\n\s]+/g, "") || "",
      igAccountId: Deno.env.get("META_IG_ACCOUNT_ID")?.trim() || "",
      instanceName: "env-fallback",
    };
  }

  return { accessToken: "", instanceName: "none" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversation_id, content, message_type, interactive_data, skip_db_save, instance_id } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "conversation_id and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get conversation details
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, channel, contact_phone, contact_instagram, contact_email, contact_name")
      .eq("id", conversation_id)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let externalMessageId: string | null = null;

    // ── Resolve instance for WhatsApp to check provider ──
    let resolvedProvider = "meta"; // default
    if (conv.channel === "whatsapp" && !instance_id) {
      // Check if there's a wuzapi instance active
      const { data: wuzapiInstances } = await supabase
        .from("channel_instances")
        .select("id, config")
        .eq("channel_type", "whatsapp")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      
      const wuzapiInst = wuzapiInstances?.find((i: any) => (i.config as any)?.provider === "wuzapi");
      if (wuzapiInst) {
        resolvedProvider = "wuzapi";
      }
    } else if (instance_id) {
      const { data: inst } = await supabase
        .from("channel_instances")
        .select("config")
        .eq("id", instance_id)
        .single();
      if (inst?.config && (inst.config as any)?.provider === "wuzapi") {
        resolvedProvider = "wuzapi";
      }
    }

    // ── Instagram: send via Meta Graph API ──
    if (conv.channel === "instagram") {
      const creds = await resolveCredentials(supabase, "instagram", instance_id);

      if (!creds.accessToken || !creds.igAccountId) {
        return new Response(JSON.stringify({ error: "No Instagram credentials configured. Create an active Instagram instance or set META_PAGE_ACCESS_TOKEN + META_IG_ACCOUNT_ID." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!conv.contact_instagram) {
        return new Response(JSON.stringify({ error: "No Instagram contact identifier" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const igResponse = await fetch(`${IG_GRAPH_URL}/${creds.igAccountId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${creds.accessToken}` },
        body: JSON.stringify({
          recipient: { id: conv.contact_instagram },
          message: { text: content },
        }),
      });

      const igResult = await igResponse.json();
      if (!igResponse.ok) {
        console.error(`[MESSAGE-SEND] Instagram API error (instance: ${creds.instanceName}):`, JSON.stringify(igResult));
        // Fire-and-forget: badge for failed send
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              _badgeRequest: true, conversationId: conversation_id, channel: "instagram",
              badgeCode: "emmely_msg_failed", headerTitle: "Erro de Envio (Instagram)",
              messagePreview: content, instanceName: creds.instanceName,
            }),
          }).catch(() => {});
        } catch {}
        return new Response(JSON.stringify({ error: "Failed to send Instagram message", details: igResult, instance: creds.instanceName }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      externalMessageId = igResult.message_id ?? null;

    // ── WhatsApp: send via WhatsApp Business API (Meta Cloud API) ──
    } else if (conv.channel === "whatsapp") {
      const creds = await resolveCredentials(supabase, "whatsapp", instance_id);

      if (!creds.accessToken || !creds.phoneNumberId) {
        return new Response(JSON.stringify({ error: "No WhatsApp credentials configured. Create an active WhatsApp instance or set META_WA_ACCESS_TOKEN + META_WA_PHONE_NUMBER_ID." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!conv.contact_phone) {
        return new Response(JSON.stringify({ error: "No phone number for WhatsApp contact" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = conv.contact_phone.replace(/[^0-9]/g, "");

      // Build WhatsApp message payload based on type
      let waPayload: any;

      if (message_type === "interactive_buttons" && interactive_data) {
        const buttons = (interactive_data as any[]).slice(0, 3).map((btn: any, i: number) => ({
          type: "reply",
          reply: { id: btn.id || `btn_${i}`, title: (btn.title || btn.label || `Opção ${i + 1}`).substring(0, 20) },
        }));
        waPayload = {
          messaging_product: "whatsapp", to: phone, type: "interactive",
          interactive: { type: "button", body: { text: content }, action: { buttons } },
        };
      } else if (message_type === "interactive_list" && interactive_data) {
        const rows = (interactive_data as any[]).slice(0, 10).map((item: any, i: number) => ({
          id: item.id || `item_${i}`,
          title: (item.title || `Item ${i + 1}`).substring(0, 24),
          description: (item.description || "").substring(0, 72),
        }));
        waPayload = {
          messaging_product: "whatsapp", to: phone, type: "interactive",
          interactive: { type: "list", body: { text: content }, action: { button: "Selecionar", sections: [{ title: "Opções", rows }] } },
        };
      } else if (message_type === "image" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "image", image: { link: interactive_data.url || interactive_data, caption: content } };
      } else if (message_type === "document" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "document", document: { link: interactive_data.url || interactive_data, caption: content, filename: interactive_data.filename || "documento" } };
      } else if (message_type === "audio" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "audio", audio: { link: interactive_data.url || interactive_data } };
      } else if (message_type === "video" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "video", video: { link: interactive_data.url || interactive_data, caption: content } };
      } else if (message_type === "location" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "location", location: { latitude: interactive_data.latitude, longitude: interactive_data.longitude, name: interactive_data.name || "", address: interactive_data.address || "" } };
      } else if (message_type === "template" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "template", template: { name: interactive_data.name, language: { code: interactive_data.language || "pt_BR" }, components: interactive_data.components || [] } };
      } else if (message_type === "reaction" && interactive_data) {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "reaction", reaction: { message_id: interactive_data.message_id, emoji: interactive_data.emoji || "👍" } };
      } else {
        waPayload = { messaging_product: "whatsapp", to: phone, type: "text", text: { body: content } };
      }

      const waResponse = await fetch(`${WA_GRAPH_URL}/${creds.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${creds.accessToken}` },
        body: JSON.stringify(waPayload),
      });

      const waResult = await waResponse.json();
      if (!waResponse.ok) {
        console.error(`[MESSAGE-SEND] WhatsApp API error (instance: ${creds.instanceName}):`, JSON.stringify(waResult));
        // Fire-and-forget: badge for failed send
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              _badgeRequest: true, conversationId: conversation_id, channel: "whatsapp",
              badgeCode: "emmely_msg_failed", headerTitle: "Erro de Envio (WhatsApp)",
              messagePreview: content, instanceName: creds.instanceName,
            }),
          }).catch(() => {});
        } catch {}
        return new Response(JSON.stringify({ error: "Failed to send WhatsApp message", details: waResult, instance: creds.instanceName }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      externalMessageId = waResult.messages?.[0]?.id ?? null;

    // ── WhatsApp via WUZAPI ──
    } else if (conv.channel === "whatsapp" && resolvedProvider === "wuzapi") {
      // Get WUZAPI credentials from channel_instances or integration_credentials
      let wuzapiBaseUrl = "";
      let wuzapiToken = "";

      // Try channel_instances first
      const { data: wuzapiInstances } = await supabase
        .from("channel_instances")
        .select("config")
        .eq("channel_type", "whatsapp")
        .eq("status", "active");

      const wuzapiInst = wuzapiInstances?.find((i: any) => (i.config as any)?.provider === "wuzapi");
      if (wuzapiInst?.config) {
        const cfg = wuzapiInst.config as any;
        wuzapiBaseUrl = (cfg.base_url || "").trim();
        wuzapiToken = (cfg.user_token || "").trim();
      }

      // Fallback to integration_credentials
      if (!wuzapiBaseUrl || !wuzapiToken) {
        const { data: creds } = await supabase
          .from("integration_credentials")
          .select("credential_key, credential_value")
          .eq("provider", "wuzapi");

        if (creds) {
          for (const c of creds) {
            if (c.credential_key === "WUZAPI_BASE_URL" && !wuzapiBaseUrl) wuzapiBaseUrl = c.credential_value?.trim() || "";
            if (c.credential_key === "WUZAPI_USER_TOKEN" && !wuzapiToken) wuzapiToken = c.credential_value?.trim() || "";
          }
        }
      }

      if (!wuzapiBaseUrl || !wuzapiToken) {
        return new Response(JSON.stringify({ error: "Credenciais WhatsApp QRCode não configuradas." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!conv.contact_phone) {
        return new Response(JSON.stringify({ error: "Sem número de telefone para o contacto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = conv.contact_phone.replace(/[^0-9]/g, "");
      wuzapiBaseUrl = wuzapiBaseUrl.replace(/\/+$/, "");

      // Determine WUZAPI endpoint based on message type
      let wuzapiEndpoint = "/chat/send/text";
      let wuzapiPayload: any = { Phone: phone, Body: content };

      if (message_type === "image" && interactive_data) {
        wuzapiEndpoint = "/chat/send/image";
        wuzapiPayload = { Phone: phone, Image: interactive_data.url || interactive_data, Caption: content };
      } else if (message_type === "document" && interactive_data) {
        wuzapiEndpoint = "/chat/send/document";
        wuzapiPayload = { Phone: phone, Document: interactive_data.url || interactive_data, FileName: interactive_data.filename || "documento", Caption: content };
      } else if (message_type === "audio" && interactive_data) {
        wuzapiEndpoint = "/chat/send/audio";
        wuzapiPayload = { Phone: phone, Audio: interactive_data.url || interactive_data };
      } else if (message_type === "video" && interactive_data) {
        wuzapiEndpoint = "/chat/send/video";
        wuzapiPayload = { Phone: phone, Video: interactive_data.url || interactive_data, Caption: content };
      }

      const wuzapiRes = await fetch(`${wuzapiBaseUrl}${wuzapiEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": wuzapiToken },
        body: JSON.stringify(wuzapiPayload),
      });

      const wuzapiResult = await wuzapiRes.json().catch(() => ({}));
      if (!wuzapiRes.ok) {
        console.error("[MESSAGE-SEND] WUZAPI error:", JSON.stringify(wuzapiResult));
        return new Response(JSON.stringify({ error: "Falha ao enviar via WhatsApp QRCode", details: wuzapiResult }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      externalMessageId = wuzapiResult.MessageID || wuzapiResult.Id || null;
    }
    // email/webchat: just DB insert (no external send)

    // Save outbound message (unless skip_db_save)
    if (!skip_db_save) {
      await supabase.from("messages").insert({
        conversation_id,
        direction: "outbound",
        content,
        sender_name: "Atendente",
        external_id: externalMessageId,
        delivery_status: "sent",
        media_type: message_type && message_type !== "interactive_buttons" && message_type !== "interactive_list" ? message_type : null,
      });

      await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
      }).eq("id", conversation_id);
    }

    // Create Bitrix24 badge activity for sent message (fire and forget)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/bitrix24-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          _badgeRequest: true,
          conversationId: conversation_id,
          channel: conv.channel,
          badgeCode: "emmely_msg_sent",
          headerTitle: "Mensagem Enviada",
          messagePreview: content,
        }),
      }).catch(() => {});
    } catch {}

    return new Response(JSON.stringify({ success: true, message_id: externalMessageId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[MESSAGE-SEND] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
