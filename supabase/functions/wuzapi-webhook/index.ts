import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Instance UUID may be supplied via query (?instance=...) or header — used to route to the correct Bitrix24 Open Line
    const instanceIdFromUrl = url.searchParams.get("instance") || url.searchParams.get("instanceId") || req.headers.get("x-instance-id") || null;

    const body = await req.json();
    console.log("[WUZAPI-WEBHOOK] Received:", JSON.stringify(body).slice(0, 500), "instance:", instanceIdFromUrl);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const instanceId: string | null = instanceIdFromUrl || body.instance_id || body.instanceId || null;

    // WUZAPI sends different payload formats:
    // Format A (expected):  { event: "Message", data: { Info: {...}, Message: {...} } }
    // Format B (actual):    { event: { Info: {...}, Message: {...} } }  — event IS the data
    // Format C (flat):      { Info: {...}, Message: {...} }
    let eventType: string | undefined;
    let messageData: any;

    if (typeof body.event === "string") {
      // Format A: event is a string like "Message"
      eventType = body.event;
      messageData = body.data || body;
    } else if (body.event && typeof body.event === "object" && (body.event.Info || body.event.Message)) {
      // Format B: event IS the message object
      eventType = "Message";
      messageData = body.event;
    } else if (body.Info || body.Message) {
      // Format C: flat payload
      eventType = "Message";
      messageData = body;
    } else {
      eventType = body.type;
      messageData = body.data || body;
    }

    // Handle delivery/read receipts → update outbound message delivery_status
    if (eventType === "ReadReceipt" || eventType === "Receipt" || eventType === "readreceipt" || eventType === "receipt") {
      try {
        const r = messageData || {};
        const ids: string[] = (r.MessageIDs || r.messageIds || r.Ids || r.IDs || r.ids || (r.MessageID ? [r.MessageID] : (r.id ? [r.id] : []))) as string[];
        const receiptType = String(r.Type || r.type || r.ReadType || "").toLowerCase();
        const newStatus = receiptType === "read" || receiptType === "played" ? "read"
                        : receiptType === "delivery" || receiptType === "delivered" ? "delivered"
                        : "delivered";
        if (Array.isArray(ids) && ids.length) {
          await supabase.from("messages").update({ delivery_status: newStatus, ...(newStatus === "read" ? { read_at: new Date().toISOString() } : {}) }).in("external_id", ids);
          console.log(`[WUZAPI-WEBHOOK] Receipt updated ${ids.length} message(s) → ${newStatus}`);
        }
      } catch (e) { console.warn("[WUZAPI-WEBHOOK] receipt error", e); }
      return new Response(JSON.stringify({ ok: true, receipt: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Only process incoming messages
    if (eventType !== "Message" && eventType !== "message") {
      console.log(`[WUZAPI-WEBHOOK] Ignoring event type: ${eventType}`);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract message data from WUZAPI payload
    const info = messageData.Info || messageData.info || {};
    let message = messageData.Message || messageData.message || {};

    const pickIdentifierField = (fieldNames: string[]) => {
      const visited = new Set<any>();
      const scan = (value: any): string => {
        if (!value || typeof value !== "object" || visited.has(value)) return "";
        visited.add(value);
        for (const name of fieldNames) {
          const direct = value[name];
          if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct).trim();
        }
        for (const nested of Object.values(value)) {
          const found = scan(nested);
          if (found) return found;
        }
        return "";
      };
      return scan(messageData) || scan(body);
    };

    const cleanWhatsappPhone = (value: string) => {
      const jid = String(value || "").trim();
      if (!jid || jid.includes("@lid") || jid.includes("@g.us")) return "";
      return jid.replace(/@.*$/, "").replace(/[^0-9]/g, "");
    };

    // WhatsApp (since 2024) sends TWO identifiers per message:
    //  - Chat:   "196847578665004@lid"           ← Linked ID (anonymous hash, NOT a phone)
    //  - Sender: "5511978659280@s.whatsapp.net"  ← real international phone number
    // We must persist BOTH: phone for Bitrix/CRM matching, LID for sending replies via WUZAPI.
    const chatRaw   = info.Chat || info.chat || info.RemoteJid || info.remoteJid || pickIdentifierField(["Chat", "chat", "RemoteJid", "remoteJid", "JID", "jid"]) || "";
    const senderRaw = info.Sender || info.sender || info.SenderAlt || info.senderAlt || info.Participant || info.participant || pickIdentifierField(["Sender", "sender", "SenderAlt", "senderAlt", "Participant", "participant"]) || "";
    // WhatsApp LID-system also exposes the real phone via these alt fields when available
    const senderPnRaw = info.SenderPN || info.SenderPn || info.senderPn || info.sender_pn || pickIdentifierField(["SenderPN", "SenderPn", "senderPn", "sender_pn", "SenderPhone", "senderPhone"]) || "";
    const participantPnRaw = info.ParticipantPN || info.ParticipantPn || info.participantPn || info.participant_pn || pickIdentifierField(["ParticipantPN", "ParticipantPn", "participantPn", "participant_pn", "ParticipantPhone", "participantPhone"]) || "";
    const altPhoneRaw = pickIdentifierField(["Phone", "phone", "PhoneNumber", "phoneNumber", "Number", "number", "User", "user"]);

    // Pick a JID that is NOT @lid as the real phone source
    const realPhoneJid =
      (senderPnRaw && !senderPnRaw.includes("@lid") && senderPnRaw) ||
      (participantPnRaw && !participantPnRaw.includes("@lid") && participantPnRaw) ||
      (altPhoneRaw && !altPhoneRaw.includes("@lid") && altPhoneRaw) ||
      (!senderRaw.includes("@lid") && senderRaw) ||
      (!chatRaw.includes("@lid") && chatRaw) ||
      "";

    // Pick the LID (if any)
    const lidJid =
      (chatRaw.includes("@lid") && chatRaw) ||
      (senderRaw.includes("@lid") && senderRaw) ||
      null;

    let phone = realPhoneJid ? cleanWhatsappPhone(realPhoneJid) : "";
    const lidId = lidJid ? lidJid.replace(/@.*$/, "") : null;

    if (!phone && !lidId) {
      console.log("[WUZAPI-WEBHOOK] No phone or LID found in payload");
      return new Response(JSON.stringify({ ok: true, no_identifier: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[WUZAPI-WEBHOOK] Identified — phone: ${phone || "(none)"} | lid: ${lidId || "(none)"} | chat: ${chatRaw} | sender: ${senderRaw} | senderPn: ${senderPnRaw || "-"} | participantPn: ${participantPnRaw || "-"}`);

    // If we only got a LID, try to resolve the real phone:
    //  1) Look up an existing conversation for this LID that already has contact_phone
    //  2) Ask WUZAPI's /user/info for this JID — many BR contacts return the real number there
    if (!phone && lidId) {
      try {
        const { data: prior } = await supabase
          .from("conversations")
          .select("contact_phone")
          .eq("channel", "whatsapp")
          .eq("contact_lid", lidId)
          .not("contact_phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prior?.contact_phone) {
          phone = String(prior.contact_phone).replace(/[^0-9]/g, "");
          console.log(`[WUZAPI-WEBHOOK] Phone resolved from prior conversation: ${phone}`);
        }
      } catch (_e) { /* ignore */ }

      if (!phone) {
        try {
          const { data: wuzCreds } = await supabase
            .from("integration_credentials")
            .select("credential_key, credential_value")
            .eq("provider", "wuzapi");
          let baseUrl = "";
          let token = "";
          for (const c of (wuzCreds || [])) {
            if (c.credential_key === "WUZAPI_BASE_URL" && !baseUrl) baseUrl = c.credential_value?.trim() || "";
            if (c.credential_key === "WUZAPI_USER_TOKEN" && !token) token = c.credential_value?.trim() || "";
          }
          if (baseUrl && token) {
            baseUrl = baseUrl.replace(/\/+$/, "");
            const infoRes = await fetch(`${baseUrl}/user/info`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "token": token },
              body: JSON.stringify({ Phone: [`${lidId}@lid`] }),
            });
            if (infoRes.ok) {
              const infoJson: any = await infoRes.json().catch(() => ({}));
              // Response shape: { code, success, data: { Users: { "<jid>": { VerifiedName, ... } } } } or similar
              const usersBlock = infoJson?.data?.Users || infoJson?.Users || {};
              const userInfo: any = usersBlock[`${lidId}@lid`] || Object.values(usersBlock)[0];
              const candidate = userInfo?.JID || userInfo?.Jid || userInfo?.jid || userInfo?.Phone || userInfo?.PhoneNumber || userInfo?.Number || userInfo?.PN || "";
              const cleaned = cleanWhatsappPhone(String(candidate));
              if (cleaned && cleaned !== lidId) {
                phone = cleaned;
                console.log(`[WUZAPI-WEBHOOK] Phone resolved from /user/info: ${phone}`);
              } else {
                console.log("[WUZAPI-WEBHOOK] /user/info did not return a real phone, keeping LID only");
              }
            }
          }
        } catch (e) {
          console.warn("[WUZAPI-WEBHOOK] /user/info lookup failed:", e);
        }
      }
    }

    // Skip outgoing messages (from me)
    const fromMe = info.FromMe || info.fromMe || false;
    if (fromMe) {
      console.log("[WUZAPI-WEBHOOK] Skipping outgoing message");
      return new Response(JSON.stringify({ ok: true, skipped: "from_me" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract message content + media node (encrypted media metadata)
    let content = "";
    let mediaType: string | null = null;
    let mediaUrl: string | null = null;
    let mediaFilename: string | null = null;
    let mediaMime: string | null = null;
    let mediaNode: any = null;          // raw node containing Url/MediaKey/etc.
    let mediaDownloadKind: string | null = null; // "image"|"audio"|"document"|"video"

    const pickField = (obj: any, names: string[]) => {
      for (const n of names) {
        if (obj && obj[n] !== undefined && obj[n] !== null && obj[n] !== "") return obj[n];
      }
      return undefined;
    };

    const normalizeBase64Field = (value: unknown): string | undefined => {
      if (value === undefined || value === null || value === "") return undefined;
      return String(value).trim().replace(/\s/g, "+");
    };

    const extractDownloadedBase64 = (payload: any): string | undefined => {
      const candidates = [
        payload?.data?.Data,
        payload?.data?.data,
        payload?.data?.base64,
        payload?.Data,
        payload?.Base64,
        payload?.base64,
        typeof payload?.data === "string" ? payload.data : undefined,
        typeof payload === "string" ? payload : undefined,
      ];
      const found = candidates.find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
      return found ? String(found).trim().replace(/^data:[^,]+,/i, "") : undefined;
    };

    const decodeBase64Bytes = (value: string): Uint8Array => {
      const raw = String(value || "").trim().replace(/^data:[^,]+,/i, "");
      const variants = [
        raw.replace(/\s+/g, ""),
        raw.replace(/\s+/g, "+"),
        raw.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, ""),
      ];

      let lastErr: unknown;
      for (const candidate of variants) {
        if (!candidate) continue;
        const padded = candidate.padEnd(candidate.length + ((4 - (candidate.length % 4)) % 4), "=");
        try {
          return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error("Invalid base64 media payload");
    };

    const uploadMediaBytes = async (bytes: Uint8Array, kind: string, mime: string | null, filename: string | null) => {
      const ext = (mime?.split("/")?.[1] || "bin").split(";")[0].split("+")[0] || "bin";
      const safeName = filename || `${kind}-${Date.now()}.${ext}`;
      const objectPath = `wuzapi-inbound/${Date.now()}-${safeName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("media").upload(objectPath, bytes, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
      if (upErr) {
        console.warn("[WUZAPI-WEBHOOK] Storage upload failed:", upErr.message);
        return null;
      }
      const { data: pub } = supabase.storage.from("media").getPublicUrl(objectPath);
      console.log(`[WUZAPI-WEBHOOK] Media uploaded (${bytes.length}B): ${pub.publicUrl}`);
      return { publicUrl: pub.publicUrl, filename: safeName };
    };

    // Unwrap WhatsApp/whatsmeow message wrappers (Ephemeral, ViewOnce, Edited, DeviceSent...)
    // The real message type is nested inside `.Message` of these wrappers.
    let unwrapDepth = 0;
    while (unwrapDepth < 4) {
      const wrapper =
        message.EphemeralMessage || message.ephemeralMessage ||
        message.ViewOnceMessage || message.viewOnceMessage ||
        message.ViewOnceMessageV2 || message.viewOnceMessageV2 ||
        message.ViewOnceMessageV2Extension || message.viewOnceMessageV2Extension ||
        message.DeviceSentMessage || message.deviceSentMessage ||
        message.EditedMessage || message.editedMessage ||
        (message.ProtocolMessage?.EditedMessage || message.protocolMessage?.editedMessage);
      const inner = wrapper?.Message || wrapper?.message;
      if (!inner || typeof inner !== "object") break;
      console.log(`[WUZAPI-WEBHOOK] Unwrapped message wrapper, depth=${unwrapDepth + 1}`);
      message = inner;
      unwrapDepth++;
    }

    if (message.Conversation || message.conversation) {
      content = message.Conversation || message.conversation;
    } else if (message.ExtendedTextMessage || message.extendedTextMessage) {
      const ext = message.ExtendedTextMessage || message.extendedTextMessage;
      content = ext.Text || ext.text || "";
    } else if (message.ImageMessage || message.imageMessage) {
      const img = message.ImageMessage || message.imageMessage;
      content = img.Caption || img.caption || "";
      mediaType = "image";
      mediaNode = img;
      mediaDownloadKind = "image";
      mediaMime = pickField(img, ["Mimetype", "mimetype", "MimeType"]) || "image/jpeg";
    } else if (message.DocumentMessage || message.documentMessage || message.documentWithCaptionMessage) {
      const doc = message.DocumentMessage || message.documentMessage || message.documentWithCaptionMessage?.message?.documentMessage || {};
      mediaFilename = pickField(doc, ["FileName", "fileName", "Title", "title"]) || null;
      content = doc.Caption || doc.caption || mediaFilename || "";
      mediaType = "document";
      mediaNode = doc;
      mediaDownloadKind = "document";
      mediaMime = pickField(doc, ["Mimetype", "mimetype"]) || "application/octet-stream";
    } else if (message.AudioMessage || message.audioMessage || message.PttMessage || message.pttMessage) {
      const aud = message.AudioMessage || message.audioMessage || message.PttMessage || message.pttMessage;
      content = "";
      mediaType = "audio";
      mediaNode = aud;
      mediaDownloadKind = "audio";
      mediaMime = pickField(aud, ["Mimetype", "mimetype"]) || "audio/ogg";
    } else if (message.VideoMessage || message.videoMessage) {
      const vid = message.VideoMessage || message.videoMessage;
      content = vid.Caption || vid.caption || "";
      mediaType = "video";
      mediaNode = vid;
      mediaDownloadKind = "video";
      mediaMime = pickField(vid, ["Mimetype", "mimetype"]) || "video/mp4";
    } else if (message.StickerMessage || message.stickerMessage) {
      const stk = message.StickerMessage || message.stickerMessage;
      content = "";
      mediaType = "image";
      mediaNode = stk;
      mediaDownloadKind = "image";
      mediaMime = pickField(stk, ["Mimetype", "mimetype"]) || "image/webp";
    } else if (message.ContactMessage || message.contactMessage) {
      const ct = message.ContactMessage || message.contactMessage;
      content = `[Contato] ${ct.DisplayName || ct.displayName || ""}`;
    } else if (message.LocationMessage || message.locationMessage) {
      content = "[Localização]";
    } else if (message.ReactionMessage || message.reactionMessage) {
      const rx = message.ReactionMessage || message.reactionMessage;
      content = `[Reação] ${rx.Text || rx.text || ""}`.trim();
    } else if (message.PollCreationMessage || message.pollCreationMessage || message.PollCreationMessageV3 || message.pollCreationMessageV3) {
      const poll = message.PollCreationMessage || message.pollCreationMessage || message.PollCreationMessageV3 || message.pollCreationMessageV3;
      content = `[Enquete] ${poll.Name || poll.name || ""}`.trim();
    } else if (message.PollUpdateMessage || message.pollUpdateMessage) {
      content = "[Voto em enquete]";
    } else if (message.LiveLocationMessage || message.liveLocationMessage) {
      content = "[Localização ao vivo]";
    } else if (message.ButtonsResponseMessage || message.buttonsResponseMessage) {
      const br = message.ButtonsResponseMessage || message.buttonsResponseMessage;
      content = br.SelectedDisplayText || br.selectedDisplayText || br.SelectedButtonId || "[Botão selecionado]";
    } else if (message.ListResponseMessage || message.listResponseMessage) {
      const lr = message.ListResponseMessage || message.listResponseMessage;
      content = lr.Title || lr.title || lr.SingleSelectReply?.SelectedRowId || "[Item selecionado]";
    } else if (message.TemplateButtonReplyMessage || message.templateButtonReplyMessage) {
      const tr = message.TemplateButtonReplyMessage || message.templateButtonReplyMessage;
      content = tr.SelectedDisplayText || tr.selectedDisplayText || "[Resposta de template]";
    } else if (message.InteractiveResponseMessage || message.interactiveResponseMessage) {
      const ir = message.InteractiveResponseMessage || message.interactiveResponseMessage;
      content = ir?.Body?.Text || ir?.body?.text || "[Resposta interativa]";
    } else if (
      message.SenderKeyDistributionMessage || message.senderKeyDistributionMessage ||
      message.ProtocolMessage || message.protocolMessage ||
      message.MessageContextInfo || message.messageContextInfo ||
      message.KeepInChatMessage || message.keepInChatMessage ||
      message.PinInChatMessage || message.pinInChatMessage
    ) {
      // System / metadata-only messages — silently skip without persisting noise
      console.log(`[WUZAPI-WEBHOOK] Skipping system message. Keys=${Object.keys(message).join(",")}`);
      return new Response(JSON.stringify({ ok: true, skipped: "system_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      console.warn(`[WUZAPI-WEBHOOK] Unsupported message type. Keys=${Object.keys(message).join(",")} payload=${JSON.stringify(message).slice(0, 1500)}`);
      try {
        await supabase.from("bitrix24_debug_logs").insert({
          event_type: "wuzapi_unsupported_message",
          direction: "inbound",
          payload: { keys: Object.keys(message), message, info },
        });
      } catch (_e) { /* ignore */ }
      content = "[Mensagem não suportada]";
    }

    // Try to download + upload media to Storage so Bitrix24 and Atendimento can fetch it via public URL
    if (mediaNode && mediaDownloadKind) {
      // Dump full media node for debugging — WUZAPI payload shapes vary by fork/version
      console.log(`[WUZAPI-WEBHOOK] Media node detected (${mediaDownloadKind}) keys=${Object.keys(mediaNode).join(",")} node=${JSON.stringify(mediaNode).slice(0, 1500)}`);
      // 0) Some WUZAPI forks expose a ready-to-use HTTPS URL on the node itself
      const directHttpsUrl = pickField(mediaNode, ["DownloadUrl", "downloadUrl", "PublicUrl", "publicUrl", "MediaUrl", "mediaUrl"]);
      if (directHttpsUrl && /^https?:\/\//i.test(directHttpsUrl)) {
        mediaUrl = directHttpsUrl;
        console.log(`[WUZAPI-WEBHOOK] Media direct URL used: ${mediaUrl}`);
      }
      try {
        const embeddedBase64 = extractDownloadedBase64({
          data: pickField(mediaNode, ["Data", "data", "Base64", "base64", "File", "file", "Body", "body"]),
        });
        if (!mediaUrl && embeddedBase64) {
          const binary = decodeBase64Bytes(embeddedBase64);
          const uploaded = await uploadMediaBytes(binary, mediaDownloadKind, mediaMime, mediaFilename);
          if (uploaded) {
            mediaUrl = uploaded.publicUrl;
            if (!mediaFilename) mediaFilename = uploaded.filename;
          }
        }

        const { data: wuzCreds2 } = await supabase
          .from("integration_credentials")
          .select("credential_key, credential_value")
          .eq("provider", "wuzapi");
        let dlBaseUrl = "";
        let dlToken = "";
        for (const c of (wuzCreds2 || [])) {
          if (c.credential_key === "WUZAPI_BASE_URL" && !dlBaseUrl) dlBaseUrl = c.credential_value?.trim() || "";
          if (c.credential_key === "WUZAPI_USER_TOKEN" && !dlToken) dlToken = c.credential_value?.trim() || "";
        }
        if (!mediaUrl && dlBaseUrl && dlToken) {
          dlBaseUrl = dlBaseUrl.replace(/\/+$/, "");
          const dlPayload: Record<string, any> = {
            Url: pickField(mediaNode, ["Url", "URL", "url"]),
            DirectPath: pickField(mediaNode, ["DirectPath", "directPath"]),
            Mimetype: mediaMime,
            MimeType: mediaMime,
            FileSHA256: normalizeBase64Field(pickField(mediaNode, ["FileSHA256", "fileSHA256", "FileSha256", "fileSha256", "file_sha256"])),
            FileEncSHA256: normalizeBase64Field(pickField(mediaNode, ["FileEncSHA256", "fileEncSHA256", "FileEncSha256", "fileEncSha256", "file_enc_sha256"])),
            FileLength: pickField(mediaNode, ["FileLength", "fileLength"]),
            AudioLength: mediaDownloadKind === "audio" ? pickField(mediaNode, ["Seconds", "seconds", "Duration", "duration", "AudioLength", "audioLength"]) : undefined,
            MediaKey: normalizeBase64Field(pickField(mediaNode, ["MediaKey", "mediaKey"])),
          };
          for (const k of Object.keys(dlPayload)) if (dlPayload[k] === undefined) delete dlPayload[k];

          const sizeBytes = Number(dlPayload.FileLength || 0);
          const dlEndpoint = `/chat/download${mediaDownloadKind}`;
          console.log(`[WUZAPI-WEBHOOK] Downloading media: ${dlEndpoint} mime=${mediaMime} size=${sizeBytes}B keys=${Object.keys(dlPayload).join(",")}`);

          const downloadPayloads = [
            dlPayload,
            {
              Url: dlPayload.Url,
              DirectPath: dlPayload.DirectPath,
              Mimetype: dlPayload.Mimetype,
              MimeType: dlPayload.MimeType,
              FileLength: dlPayload.FileLength,
            },
          ].map((payload) => {
            const cleaned: Record<string, any> = {};
            for (const [key, value] of Object.entries(payload)) {
              if (value !== undefined && value !== null && value !== "") cleaned[key] = value;
            }
            return cleaned;
          });

          let dlJson: any = null;
          let dlOk = false;
          let lastStatus = 0;
          let lastBody = "";
          for (const payload of downloadPayloads) {
            if (!payload.Url && !payload.DirectPath) continue;
            const dlRes = await fetch(`${dlBaseUrl}${dlEndpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "token": dlToken },
              body: JSON.stringify(payload),
            });
            lastStatus = dlRes.status;
            const rawBody = await dlRes.text();
            if (!dlRes.ok) {
              lastBody = rawBody.slice(0, 400);
              continue;
            }
            try {
              dlJson = JSON.parse(rawBody || "{}");
            } catch {
              dlJson = rawBody;
            }
            dlOk = true;
            break;
          }

          if (!dlOk) {
            console.warn(`[WUZAPI-WEBHOOK] Download failed endpoint=${dlEndpoint} status=${lastStatus} body=${lastBody}`);
            try {
              await supabase.from("bitrix24_debug_logs").insert({
                event_type: "wuzapi_media_download_failed",
                direction: "inbound",
                payload: { endpoint: dlEndpoint, status: lastStatus, body: lastBody, mediaNode },
                error: `status=${lastStatus}`,
              });
            } catch (_e) { /* ignore */ }
          } else {
            const b64 = extractDownloadedBase64(dlJson);
            if (b64 && typeof b64 === "string") {
              try {
                const binary = decodeBase64Bytes(b64);
                const uploaded = await uploadMediaBytes(binary, mediaDownloadKind, mediaMime, mediaFilename);
                if (uploaded) {
                  mediaUrl = uploaded.publicUrl;
                  if (!mediaFilename) mediaFilename = uploaded.filename;
                }
              } catch (decErr) {
                console.warn("[WUZAPI-WEBHOOK] Base64 decode failed:", decErr);
              }
            } else {
              const sample = typeof dlJson === "string" ? dlJson.slice(0, 400) : JSON.stringify(dlJson).slice(0, 400);
              console.warn(`[WUZAPI-WEBHOOK] Download response missing base64. Keys=${Object.keys(dlJson || {}).join(",")} sample=${sample}`);
              try {
                await supabase.from("bitrix24_debug_logs").insert({
                  event_type: "wuzapi_media_no_base64",
                  direction: "inbound",
                  payload: { endpoint: dlEndpoint, response: dlJson, mediaNode },
                });
              } catch (_e) { /* ignore */ }
            }
          }
        } else if (!mediaUrl) {
          console.warn(`[WUZAPI-WEBHOOK] Cannot download media — baseUrl=${!!dlBaseUrl} token=${!!dlToken}`);
        }
      } catch (e) {
        console.warn("[WUZAPI-WEBHOOK] Media download/upload error:", (e as Error).message);
      }
    }

    // Fallback content text when no caption was provided
    if (!content) {
      const placeholders: Record<string, string> = {
        image: "[Imagem]",
        audio: "[Áudio]",
        document: mediaFilename ? `[Documento] ${mediaFilename}` : "[Documento]",
        video: "[Vídeo]",
      };
      content = (mediaType && placeholders[mediaType]) || "[Mensagem vazia]";
    }

    // Auto-transcribe audio messages before forwarding to Bitrix24
    // This follows the Bitrix24 imconnector.send.messages approach: include the
    // transcription in the `text` field alongside the audio file URL in `files`.
    if (mediaType === "audio" && mediaUrl && !mediaUrl.startsWith("data:")) {
      try {
        const _sttUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/elevenlabs-stt`;
        const sttController = new AbortController();
        const sttTimeout = setTimeout(() => sttController.abort(), 15000);
        const sttRes = await fetch(_sttUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ audio_url: mediaUrl, language_code: "pt", mime_type: mediaMime || "audio/ogg" }),
          signal: sttController.signal,
        }).catch(() => null);
        clearTimeout(sttTimeout);
        if (sttRes?.ok) {
          const sttData = await sttRes.json().catch(() => null);
          if (sttData?.text) {
            content = `🎤 ${sttData.text}`;
            console.log("[WUZAPI-WEBHOOK] Auto-transcription succeeded:", content.slice(0, 80));
          }
        } else {
          console.warn("[WUZAPI-WEBHOOK] Auto-transcription failed (status):", sttRes?.status);
        }
      } catch (e) {
        console.warn("[WUZAPI-WEBHOOK] Auto-transcription error:", e);
      }
    }

    // Get sender name (push name) — fallback to phone, then LID
    const senderName = info.PushName || info.pushName || phone || lidId || "Cliente";

    // External message ID
    const externalId = info.Id || info.id || info.MessageID || "";

    // Find existing conversation: prefer by phone (real number), fall back to LID
    // This lets us re-attach the conversation once a real phone is captured.
    let existingConv: any = null;
    if (phone) {
      const r = await supabase
        .from("conversations")
        .select("id, attendance_mode, unread_count, contact_lid")
        .eq("channel", "whatsapp")
        .eq("contact_phone", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingConv = r.data;
    }
    if (!existingConv && lidId) {
      // Match LID with or without "@lid" suffix (legacy rows used both formats).
      const lidStripped = String(lidId).replace(/@lid$/, "");
      const r = await supabase
        .from("conversations")
        .select("id, attendance_mode, unread_count, contact_phone")
        .eq("channel", "whatsapp")
        .or(`contact_lid.eq.${lidStripped},contact_lid.eq.${lidStripped}@lid`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingConv = r.data;
    }

    let conversationId: string;
    let attendanceMode = "bot";

    if (existingConv) {
      conversationId = existingConv.id;
      attendanceMode = existingConv.attendance_mode || "bot";
      const updatePayload: Record<string, any> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
        last_customer_message_at: new Date().toISOString(),
        contact_name: senderName,
        unread_count: existingConv.unread_count ? existingConv.unread_count + 1 : 1,
      };
      // Backfill missing identifiers
      if (phone && !existingConv.contact_phone) updatePayload.contact_phone = phone;
      if (lidId && !existingConv.contact_lid) updatePayload.contact_lid = lidId;
      await supabase.from("conversations").update(updatePayload).eq("id", conversationId);
    } else {
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          channel: "whatsapp",
          contact_phone: phone || null,
          contact_lid: lidId,
          contact_name: senderName,
          status: "aberta",
          attendance_mode: "bot",
          last_message_at: new Date().toISOString(),
          last_message_preview: content.slice(0, 100),
          last_customer_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select("id")
        .single();

      if (convError || !newConv) {
        console.error("[WUZAPI-WEBHOOK] Error creating conversation:", convError);
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = newConv.id;
    }

    // Dedup: check if this message was sent by Emmely (echo prevention)
    if (externalId) {
      const { data: dedupHit } = await supabase
        .from("sync_dedup_cache")
        .select("id")
        .eq("entity_type", "message")
        .eq("external_id", externalId)
        .eq("source", "emmely")
        .maybeSingle();
      if (dedupHit) {
        console.log("[WUZAPI-WEBHOOK] Dedup: skipping echo message:", externalId);
        return new Response(JSON.stringify({ ok: true, skipped: "dedup_echo" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert message
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      content,
      sender_name: senderName,
      external_id: externalId,
      media_type: mediaType,
      media_url: mediaUrl,
      delivery_status: "delivered",
      sync_source: "bitrix24",
    });
    if (insertError) {
      console.error("[WUZAPI-WEBHOOK] messages insert error:", insertError);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Forward message to Bitrix24 Open Channel
    // contactId MUST be the real phone (not the LID) so Bitrix matches existing
    // Contact + Deal in the portal. Fall back to LID only when no phone is available.
    const bitrixContactId = phone || lidId || "";
    try {
      const bitrixResponse = await fetch(`${supabaseUrl}/functions/v1/bitrix24-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          message: content,
          contactName: senderName,
          contactId: bitrixContactId,
          contactPhone: phone || undefined,
          channel: "whatsapp",
          conversationId,
          instanceId, // routes to the Open Line linked to this instance
          mediaUrl: mediaUrl || undefined,
          mediaType: mediaType || undefined,
          mediaFilename: mediaFilename || undefined,
          mediaMime: mediaMime || undefined,
        }),
      });

      const bitrixResult = await bitrixResponse.json().catch(() => null);
      console.log("[WUZAPI-WEBHOOK] bitrix24-send result:", JSON.stringify(bitrixResult));

      if (!bitrixResponse.ok || bitrixResult?.error) {
        throw new Error(bitrixResult?.error || `bitrix24-send failed with status ${bitrixResponse.status}`);
      }
    } catch (e) {
      console.error("[WUZAPI-WEBHOOK] bitrix24-send error:", e);
    }

    // Trigger flow-engine if bot is active (unified pipeline)
    // IMPORTANT: use EdgeRuntime.waitUntil so the request completes even after
    // we return the HTTP response. Plain fire-and-forget gets cancelled by the
    // Supabase Edge Runtime when the parent isolate exits.
    if (attendanceMode === "bot") {
      const flowPromise = fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_text: content,
          message_type: messageType || "text",
          instance_id: instanceId || null,
        }),
      })
        .then(async (r) => {
          const t = await r.text().catch(() => "");
          console.log(`[WUZAPI-WEBHOOK] flow-engine status=${r.status} body=${t.slice(0, 200)}`);
        })
        .catch((e) => console.error("[WUZAPI-WEBHOOK] flow-engine error:", e));

      try {
        // @ts-ignore — EdgeRuntime is provided by Supabase Edge Runtime
        EdgeRuntime.waitUntil(flowPromise);
      } catch {
        await flowPromise; // fallback when EdgeRuntime is unavailable
      }
    }

    console.log(`[WUZAPI-WEBHOOK] Processed message — phone:${phone || "-"} lid:${lidId || "-"} conv:${conversationId}`);

    return new Response(JSON.stringify({ ok: true, conversation_id: conversationId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WUZAPI-WEBHOOK] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
