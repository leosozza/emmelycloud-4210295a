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
    const body = await req.json();
    const { conversation_id, content, message_type, resolvedInteractiveData: bodyInteractiveData, skip_db_save, instance_id, bitrix_entity_id, bitrix_entity_type_id } = body;
    const media_base64: string | undefined = body.media_base64;
    const media_mime_type: string | undefined = body.media_mime_type;
    const file_name: string | undefined = body.file_name;

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If media_base64 is provided, upload to Supabase Storage and get public URL
    let resolvedInteractiveData = bodyInteractiveData;
    if (media_base64 && media_mime_type) {
      const supabaseTemp = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const ext = media_mime_type.split("/")[1]?.split(";")[0] || "bin";
      const storagePath = `operator-media/${Date.now()}-${file_name || `media.${ext}`}`;
      const binaryData = Uint8Array.from(atob(media_base64), (c) => c.charCodeAt(0));
      const { error: uploadError } = await supabaseTemp.storage
        .from("media")
        .upload(storagePath, binaryData, { contentType: media_mime_type, upsert: false });
      if (!uploadError) {
        const { data: urlData } = supabaseTemp.storage.from("media").getPublicUrl(storagePath);
        resolvedInteractiveData = { url: urlData.publicUrl, filename: file_name };
      } else {
        console.error("[MESSAGE-SEND] Storage upload failed:", uploadError.message);
      }
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

    // ── WhatsApp: route by provider ──
    } else if (conv.channel === "whatsapp") {
      if (!conv.contact_phone) {
        return new Response(JSON.stringify({ error: "No phone number for WhatsApp contact" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const rawPhone = conv.contact_phone;
      // Detect LID contacts: stored as "196847578665004@lid" by webhook
      const isLidContact = rawPhone.includes("@lid");
      const phone = rawPhone.replace(/@.*$/, "").replace(/[^0-9]/g, "");

      // ── WUZAPI (WhatsApp QRCode) ──
      if (resolvedProvider === "wuzapi") {
        // For LID contacts, pass the full JID with @lid suffix
        // For regular phone contacts, pass just the digits
        const wuzapiPhone = isLidContact ? `${phone}@lid` : phone;
        if (isLidContact) {
          console.log(`[MESSAGE-SEND] Detected LID contact, using JID: ${wuzapiPhone}`);
        }

        let wuzapiBaseUrl = "";
        let wuzapiToken = "";

        // Resolve from integration_credentials (user token is auto-created by wuzapi-test-connection)
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

        if (!wuzapiBaseUrl || !wuzapiToken) {
          return new Response(JSON.stringify({ error: "Credenciais WhatsApp QRCode não configuradas." }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        wuzapiBaseUrl = wuzapiBaseUrl.replace(/\/+$/, "");

        let wuzapiEndpoint = "/chat/send/text";
        let wuzapiPayload: any = { Phone: wuzapiPhone, Body: content };

        if (message_type === "interactive_buttons" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/buttons";
          const buttons = (resolvedInteractiveData as any[]).slice(0, 3).map((btn: any, i: number) => ({
            buttonId: btn.id || `btn_${i}`,
            buttonText: { displayText: (btn.title || btn.label || `Opção ${i + 1}`).substring(0, 20) },
            type: 1,
          }));
          wuzapiPayload = { Phone: wuzapiPhone, Body: content, Buttons: buttons };
        } else if (message_type === "interactive_list" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/list";
          const rows = (resolvedInteractiveData as any[]).slice(0, 10).map((item: any, i: number) => ({
            RowId: item.id || `item_${i}`,
            Title: (item.title || `Item ${i + 1}`).substring(0, 24),
            Description: (item.description || "").substring(0, 72),
          }));
          wuzapiPayload = { Phone: wuzapiPhone, Body: content, ButtonText: "Selecionar", Title: "Opções", Sections: [{ Title: "Opções", Rows: rows }] };
        } else if (message_type === "image" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/image";
          wuzapiPayload = { Phone: wuzapiPhone, Image: resolvedInteractiveData.url || resolvedInteractiveData, Caption: content };
        } else if (message_type === "document" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/document";
          wuzapiPayload = { Phone: wuzapiPhone, Document: resolvedInteractiveData.url || resolvedInteractiveData, FileName: resolvedInteractiveData.filename || "documento", Caption: content };
        } else if (message_type === "audio" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/audio";
          wuzapiPayload = { Phone: wuzapiPhone, Audio: resolvedInteractiveData.url || resolvedInteractiveData };
        } else if (message_type === "video" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/video";
          wuzapiPayload = { Phone: wuzapiPhone, Video: resolvedInteractiveData.url || resolvedInteractiveData, Caption: content };
        } else if (message_type === "location" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/location";
          wuzapiPayload = { Phone: wuzapiPhone, Latitude: resolvedInteractiveData.latitude, Longitude: resolvedInteractiveData.longitude, Name: resolvedInteractiveData.name || "", Address: resolvedInteractiveData.address || "" };
        }

        console.log(`[MESSAGE-SEND] Sending via WhatsApp QRCode: ${wuzapiEndpoint}`);
        const wuzapiRes = await fetch(`${wuzapiBaseUrl}${wuzapiEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": wuzapiToken },
          body: JSON.stringify(wuzapiPayload),
        });

        const wuzapiResult = await wuzapiRes.json().catch(() => ({}));
        if (!wuzapiRes.ok) {
          console.error("[MESSAGE-SEND] WhatsApp QRCode error:", JSON.stringify(wuzapiResult));
          return new Response(JSON.stringify({ error: "Falha ao enviar via WhatsApp QRCode", details: wuzapiResult }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        externalMessageId = wuzapiResult.MessageID || wuzapiResult.Id || null;

      // ── Meta Cloud API (default) ──
      } else {
        const creds = await resolveCredentials(supabase, "whatsapp", instance_id);

        if (!creds.accessToken || !creds.phoneNumberId) {
          return new Response(JSON.stringify({ error: "No WhatsApp credentials configured. Create an active WhatsApp instance or set META_WA_ACCESS_TOKEN + META_WA_PHONE_NUMBER_ID." }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let waPayload: any;

        if (message_type === "interactive_buttons" && resolvedInteractiveData) {
          const buttons = (resolvedInteractiveData as any[]).slice(0, 3).map((btn: any, i: number) => ({
            type: "reply",
            reply: { id: btn.id || `btn_${i}`, title: (btn.title || btn.label || `Opção ${i + 1}`).substring(0, 20) },
          }));
          waPayload = { messaging_product: "whatsapp", to: phone, type: "interactive", interactive: { type: "button", body: { text: content }, action: { buttons } } };
        } else if (message_type === "interactive_list" && resolvedInteractiveData) {
          const rows = (resolvedInteractiveData as any[]).slice(0, 10).map((item: any, i: number) => ({
            id: item.id || `item_${i}`,
            title: (item.title || `Item ${i + 1}`).substring(0, 24),
            description: (item.description || "").substring(0, 72),
          }));
          waPayload = { messaging_product: "whatsapp", to: phone, type: "interactive", interactive: { type: "list", body: { text: content }, action: { button: "Selecionar", sections: [{ title: "Opções", rows }] } } };
        } else if (message_type === "image" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "image", image: { link: resolvedInteractiveData.url || resolvedInteractiveData, caption: content } };
        } else if (message_type === "document" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "document", document: { link: resolvedInteractiveData.url || resolvedInteractiveData, caption: content, filename: resolvedInteractiveData.filename || "documento" } };
        } else if (message_type === "audio" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "audio", audio: { link: resolvedInteractiveData.url || resolvedInteractiveData } };
        } else if (message_type === "video" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "video", video: { link: resolvedInteractiveData.url || resolvedInteractiveData, caption: content } };
        } else if (message_type === "location" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "location", location: { latitude: resolvedInteractiveData.latitude, longitude: resolvedInteractiveData.longitude, name: resolvedInteractiveData.name || "", address: resolvedInteractiveData.address || "" } };
        } else if (message_type === "template" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "template", template: { name: resolvedInteractiveData.name, language: { code: resolvedInteractiveData.language || "pt_BR" }, components: resolvedInteractiveData.components || [] } };
        } else if (message_type === "reaction" && resolvedInteractiveData) {
          waPayload = { messaging_product: "whatsapp", to: phone, type: "reaction", reaction: { message_id: resolvedInteractiveData.message_id, emoji: resolvedInteractiveData.emoji || "👍" } };
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
      }
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
        sync_source: "emmely",
        media_type: message_type && message_type !== "interactive_buttons" && message_type !== "interactive_list" ? message_type : null,
      });

      // Register in dedup cache to prevent echo from webhooks
      if (externalMessageId) {
        await supabase.from("sync_dedup_cache").upsert({
          entity_type: "message",
          entity_id: conversation_id,
          external_id: externalMessageId,
          source: "emmely",
        }, { onConflict: "entity_type,external_id,source" }).then(() => {})
      }

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
