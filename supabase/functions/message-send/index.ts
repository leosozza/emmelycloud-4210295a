import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IG_GRAPH_URL = "https://graph.instagram.com/v24.0";
const WA_GRAPH_URL = "https://graph.facebook.com/v22.0";

function bytesToBase64(buf: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",").pop() || "" : b64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function detectMimeFromBytes(bytes: Uint8Array, fallbackMime: string): string {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return "audio/wav";
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "audio/mp4";
  return fallbackMime;
}

function readVint(data: Uint8Array, pos: number, stripMarker: boolean): { value: number; length: number } | null {
  if (pos >= data.length) return null;
  const first = data[pos];
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || pos + length > data.length) return null;
  let value = stripMarker ? first & (mask - 1) : first;
  for (let i = 1; i < length; i++) value = value * 256 + data[pos + i];
  return { value, length };
}

function readUnsigned(data: Uint8Array): number {
  let v = 0;
  for (const b of data) v = v * 256 + b;
  return v;
}

function readString(data: Uint8Array): string {
  return new TextDecoder().decode(data).replace(/\0+$/g, "");
}

function parseEbmlElements(data: Uint8Array, start: number, end: number, cb: (id: number, contentStart: number, contentEnd: number) => void) {
  let pos = start;
  while (pos < end) {
    const id = readVint(data, pos, false);
    if (!id) break;
    const size = readVint(data, pos + id.length, true);
    if (!size) break;
    const contentStart = pos + id.length + size.length;
    const contentEnd = Math.min(contentStart + size.value, end);
    if (contentStart > end || contentEnd < contentStart) break;
    cb(id.value, contentStart, contentEnd);
    pos = contentEnd;
  }
}

function opusPacketSamples(packet: Uint8Array): number {
  if (!packet.length) return 960;
  const toc = packet[0];
  const config = toc >> 3;
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? Math.max(1, packet[1] ? packet[1] & 0x3f : 1) : 2;
  let samplesPerFrame: number;
  if (config < 12) samplesPerFrame = [480, 960, 1920, 2880][config & 3];
  else if (config < 16) samplesPerFrame = config & 1 ? 960 : 480;
  else samplesPerFrame = [120, 240, 480, 960][config & 3];
  return frames * samplesPerFrame;
}

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(page: Uint8Array): number {
  let crc = 0;
  for (const b of page) crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) & 0xff) ^ b]) >>> 0;
  return crc >>> 0;
}

function makeOggPage(packet: Uint8Array, headerType: number, granule: number, serial: number, seq: number): Uint8Array {
  const laces: number[] = [];
  let remaining = packet.length;
  while (remaining >= 255) {
    laces.push(255);
    remaining -= 255;
  }
  laces.push(remaining);
  const page = new Uint8Array(27 + laces.length + packet.length);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  page[4] = 0;
  page[5] = headerType;
  let gp = BigInt(granule);
  for (let i = 0; i < 8; i++) { page[6 + i] = Number(gp & 0xffn); gp >>= 8n; }
  for (let i = 0; i < 4; i++) page[14 + i] = (serial >>> (8 * i)) & 0xff;
  for (let i = 0; i < 4; i++) page[18 + i] = (seq >>> (8 * i)) & 0xff;
  page[26] = laces.length;
  page.set(laces, 27);
  page.set(packet, 27 + laces.length);
  const crc = oggCrc(page);
  for (let i = 0; i < 4; i++) page[22 + i] = (crc >>> (8 * i)) & 0xff;
  return page;
}

function remuxWebmOpusToOgg(webm: Uint8Array): Uint8Array | null {
  let opusTrack: number | null = null;
  let opusHead: Uint8Array | null = null;

  const parseTrackEntry = (start: number, end: number) => {
    let trackNo = 0;
    let trackType = 0;
    let codec = "";
    let privateData: any = null;
    parseEbmlElements(webm, start, end, (id, cs, ce) => {
      const val = webm.subarray(cs, ce);
      if (id === 0xd7) trackNo = readUnsigned(val);
      else if (id === 0x83) trackType = readUnsigned(val);
      else if (id === 0x86) codec = readString(val);
      else if (id === 0x63a2) privateData = val;
    });
    if ((codec.includes("OPUS") || trackType === 2) && trackNo) {
      opusTrack = trackNo;
      if (privateData && readString(privateData.subarray(0, 8)) === "OpusHead") opusHead = privateData;
    }
  };

  const scanTracks = (start: number, end: number) => parseEbmlElements(webm, start, end, (id, cs, ce) => {
    if (id === 0xae) parseTrackEntry(cs, ce);
    else if (id === 0x18538067 || id === 0x1654ae6b) scanTracks(cs, ce);
  });
  scanTracks(0, webm.length);
  if (!opusTrack) opusTrack = 1;

  const packets: Uint8Array[] = [];
  const parseBlock = (cs: number, ce: number) => {
    let pos = cs;
    const track = readVint(webm, pos, true);
    if (!track) return;
    pos += track.length;
    if (pos + 3 > ce || track.value !== opusTrack) return;
    pos += 2;
    const flags = webm[pos++];
    const lacing = (flags & 0x06) >> 1;
    if (lacing === 0) packets.push(webm.slice(pos, ce));
    else if (lacing === 1 && pos < ce) {
      const count = webm[pos++] + 1;
      const sizes: number[] = [];
      let used = 0;
      for (let i = 0; i < count - 1; i++) {
        let s = 0;
        while (pos < ce) { const b = webm[pos++]; s += b; if (b !== 255) break; }
        sizes.push(s); used += s;
      }
      sizes.push(Math.max(0, ce - pos - used));
      for (const s of sizes) { if (s > 0 && pos + s <= ce) packets.push(webm.slice(pos, pos + s)); pos += s; }
    } else if (lacing === 2 && pos < ce) {
      const count = webm[pos++] + 1;
      const size = Math.floor((ce - pos) / count);
      for (let i = 0; i < count; i++) packets.push(webm.slice(pos + i * size, pos + (i + 1) * size));
    }
  };
  const scanBlocks = (start: number, end: number) => parseEbmlElements(webm, start, end, (id, cs, ce) => {
    if (id === 0xa3 || id === 0xa1) parseBlock(cs, ce);
    else if (id === 0x18538067 || id === 0x1f43b675 || id === 0xa0) scanBlocks(cs, ce);
  });
  scanBlocks(0, webm.length);
  if (!packets.length) return null;

  if (!opusHead) {
    opusHead = new Uint8Array(19);
    opusHead.set(new TextEncoder().encode("OpusHead"), 0);
    opusHead[8] = 1; opusHead[9] = 1; opusHead[10] = 56; opusHead[11] = 1;
    opusHead[12] = 0x80; opusHead[13] = 0xbb; opusHead[14] = 0; opusHead[15] = 0;
  }
  const vendor = new TextEncoder().encode("EmmelyCloud");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(new TextEncoder().encode("OpusTags"), 0);
  tags[8] = vendor.length & 0xff; tags[9] = (vendor.length >> 8) & 0xff; tags[10] = (vendor.length >> 16) & 0xff; tags[11] = (vendor.length >> 24) & 0xff;
  tags.set(vendor, 12);

  const serial = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let seq = 0;
  let granule = 0;
  pages.push(makeOggPage(opusHead, 2, 0, serial, seq++));
  pages.push(makeOggPage(tags, 0, 0, serial, seq++));
  for (let i = 0; i < packets.length; i++) {
    granule += opusPacketSamples(packets[i]);
    pages.push(makeOggPage(packets[i], i === packets.length - 1 ? 4 : 0, granule, serial, seq++));
  }
  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of pages) { out.set(p, offset); offset += p.length; }
  return out;
}

/**
 * Convert a media URL or raw base64 string to a data URI required by WUZAPI.
 * WUZAPI's /chat/send/{audio,image,document,video} endpoints expect the
 * media field to start with "data:<mime>;base64,...".
 */
async function toDataUri(input: string, fallbackMime: string): Promise<string> {
  if (!input) return input;
  // Already a data URI
  if (input.startsWith("data:")) return input;

  // Looks like a URL → fetch and convert
  if (/^https?:\/\//i.test(input)) {
    try {
      const res = await fetch(input);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
      const buf = new Uint8Array(await res.arrayBuffer());
      const mime = detectMimeFromBytes(buf, headerMime);
      const b64 = bytesToBase64(buf);
      return `data:${mime};base64,${b64}`;
    } catch (e) {
      console.error("[MESSAGE-SEND] toDataUri fetch error:", e);
      throw new Error(`Failed to fetch media for data URI conversion: ${(e as Error).message}`);
    }
  }

  // Assume raw base64 string
  const raw = base64ToBytes(input);
  return `data:${detectMimeFromBytes(raw, fallbackMime)};base64,${bytesToBase64(raw)}`;
}

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
    const { conversation_id, content, message_type, resolvedInteractiveData: bodyInteractiveData, skip_db_save, instance_id, bitrix_entity_id, bitrix_entity_type_id, sender_name: bodySenderName, source: bodySource, ai_agent_id: bodyAiAgentId, review_context: bodyReviewContext, skip_review: bodySkipReview } = body;
    // Fase C — Quality Gate: revisa mensagens originadas por IA antes do envio
    let aiReviewId: string | null = null;
    let aiReviewScore: number | null = null;
    let aiReviewStatus: string | null = null;
    if (bodySource === "ai" && content && !bodySkipReview && (message_type === undefined || message_type === "text")) {
      try {
        const reviewResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-review-message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              conversation_id,
              agent_id: bodyAiAgentId ?? null,
              content,
              context: bodyReviewContext ?? {},
            }),
          }
        );
        const reviewData = await reviewResp.json().catch(() => ({}));
        aiReviewId = reviewData?.review_id ?? null;
        aiReviewScore = typeof reviewData?.score === "number" ? reviewData.score : null;
        if (reviewData?.blocked === true) {
          // Não envia — grava registro pendente de revisão humana
          aiReviewStatus = "pending_review";
          const supabaseBlock = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          await supabaseBlock.from("messages").insert({
            conversation_id,
            direction: "outbound",
            content,
            sender_name: bodySenderName || "IA (aguarda revisão)",
            delivery_status: "pending_review",
            sync_source: "emmely",
            ai_review_status: "pending_review",
            ai_review_score: aiReviewScore,
            ai_review_id: aiReviewId,
            originated_by_agent_id: bodyAiAgentId ?? null,
          });
          return new Response(
            JSON.stringify({
              blocked: true,
              review_id: aiReviewId,
              score: aiReviewScore,
              feedback: reviewData?.feedback,
              issues: reviewData?.issues,
              suggested_rewrite: reviewData?.suggested_rewrite,
              message: "Mensagem retida para revisão humana (quality gate).",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        aiReviewStatus = "auto_approved";
      } catch (revErr) {
        console.error("[MESSAGE-SEND] ai-review-message failed (fail-open):", (revErr as Error).message);
      }
    }

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
      .select("id, channel, contact_phone, contact_lid, contact_instagram, contact_email, contact_name")
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
      const { data: waInstances } = await supabase
        .from("channel_instances")
        .select("id, config")
        .eq("channel_type", "whatsapp")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      const gupshupInst = waInstances?.find((i: any) => (i.config as any)?.provider === "gupshup");
      const wuzapiInst = waInstances?.find((i: any) => (i.config as any)?.provider === "wuzapi");
      if (gupshupInst) resolvedProvider = "gupshup";
      else if (wuzapiInst) resolvedProvider = "wuzapi";
    } else if (instance_id) {
      const { data: inst } = await supabase
        .from("channel_instances")
        .select("config")
        .eq("id", instance_id)
        .single();
      const prov = (inst?.config as any)?.provider;
      if (prov === "gupshup") resolvedProvider = "gupshup";
      else if (prov === "wuzapi") resolvedProvider = "wuzapi";
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

      // Prefix content with sender name if provided
      const igContent = bodySenderName ? `*${bodySenderName}:*\n${content}` : content;
      const igResponse = await fetch(`${IG_GRAPH_URL}/${creds.igAccountId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${creds.accessToken}` },
        body: JSON.stringify({
          recipient: { id: conv.contact_instagram },
          message: { text: igContent },
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
      const rawPhone = (conv.contact_phone || "").trim();
      const rawLid   = ((conv as any).contact_lid || "").trim();
      // Legacy support: some old rows still have "<digits>@lid" stored in contact_phone
      const legacyLidInPhone = rawPhone.endsWith("@lid") ? rawPhone.replace(/@.*$/, "") : "";

      if (!rawPhone && !rawLid && !legacyLidInPhone) {
        return new Response(JSON.stringify({ error: "No phone or LID for WhatsApp contact" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const phone = rawPhone && !rawPhone.includes("@lid")
        ? rawPhone.replace(/[^0-9]/g, "")
        : "";
      const lid = rawLid || legacyLidInPhone || "";
      const isLidContact = !phone && !!lid;

      // ── WUZAPI (WhatsApp QRCode) ──
      if (resolvedProvider === "wuzapi") {
        // WUZAPI accepts either a phone number or a LID-suffixed JID.
        // Prefer LID when present (some BR contacts only deliver via LID).
        const wuzapiPhone = lid ? `${lid}@lid` : phone;
        if (isLidContact || lid) {
          console.log(`[MESSAGE-SEND] Using LID JID: ${wuzapiPhone}`);
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
        // Prefix content with sender name if provided
        const wuzapiContent = bodySenderName ? `*${bodySenderName}:*\n${content}` : content;
        let wuzapiPayload: any = { Phone: wuzapiPhone, Body: wuzapiContent };

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
          const src = resolvedInteractiveData.url || resolvedInteractiveData;
          wuzapiPayload = { Phone: wuzapiPhone, Image: await toDataUri(src, "image/jpeg"), Caption: content };
        } else if (message_type === "document" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/document";
          const src = resolvedInteractiveData.url || resolvedInteractiveData;
          // WUZAPI requires the document data URI to use application/octet-stream
          const rawDoc = await toDataUri(src, "application/octet-stream");
          const docData = rawDoc.startsWith("data:")
            ? `data:application/octet-stream;base64,${rawDoc.split(",")[1] ?? ""}`
            : rawDoc;
          wuzapiPayload = { Phone: wuzapiPhone, Document: docData, FileName: resolvedInteractiveData.filename || "documento", Caption: content };
        } else if (message_type === "audio" && resolvedInteractiveData) {
          // WUZAPI /chat/send/audio. Some PowerZap links are named .mp3 and even
          // served as audio/mpeg, but the bytes are WebM/Opus. WhatsApp iOS shows
          // "audio unavailable" for that mismatch, so inspect the bytes and remux
          // WebM/Opus into Ogg/Opus before sending as a voice note.
          wuzapiEndpoint = "/chat/send/audio";
          const src = resolvedInteractiveData.url || resolvedInteractiveData;
          const srcStr = String(src);
          const lower = srcStr.toLowerCase();
          let detectedMime = "audio/ogg";
          if (lower.startsWith("data:")) {
            detectedMime = lower.substring(5).split(";")[0] || "audio/ogg";
          } else if (/\.mp3(\?|$)/.test(lower)) detectedMime = "audio/mpeg";
          else if (/\.m4a(\?|$)/.test(lower) || /\.aac(\?|$)/.test(lower)) detectedMime = "audio/mp4";
          else if (/\.wav(\?|$)/.test(lower)) detectedMime = "audio/wav";
          else if (/\.opus(\?|$)/.test(lower)) detectedMime = "audio/ogg";
          else if (/\.ogg(\?|$)/.test(lower)) detectedMime = "audio/ogg";

          const rawAudio = await toDataUri(src, detectedMime);
          // If toDataUri fetched a remote file, it may have set a more accurate mime
          if (rawAudio.startsWith("data:")) {
            const m = rawAudio.substring(5).split(";")[0];
            if (m && m !== "application/octet-stream") detectedMime = m;
          }
          const b64 = rawAudio.startsWith("data:") ? (rawAudio.split(",")[1] ?? "") : rawAudio;
          let audioBytes = base64ToBytes(b64);
          detectedMime = detectMimeFromBytes(audioBytes, detectedMime);
          if (detectedMime === "audio/webm") {
            const oggBytes = remuxWebmOpusToOgg(audioBytes);
            if (oggBytes) {
              audioBytes = oggBytes;
              detectedMime = "audio/ogg";
              console.log("[MESSAGE-SEND] Remuxed WebM/Opus audio to Ogg/Opus for WhatsApp playback");
            } else {
              console.warn("[MESSAGE-SEND] WebM/Opus remux failed; falling back to document send");
              wuzapiEndpoint = "/chat/send/document";
              wuzapiPayload = {
                Phone: wuzapiPhone,
                Document: `data:application/octet-stream;base64,${bytesToBase64(audioBytes)}`,
                FileName: resolvedInteractiveData.filename || "audio.webm",
                Caption: content || "Áudio",
              };
            }
          }
          const isOpus = detectedMime === "audio/ogg" || detectedMime === "audio/opus";
          const finalMime = isOpus ? "audio/ogg" : detectedMime;
          const audioData = `data:${finalMime};base64,${bytesToBase64(audioBytes)}`;
          if (wuzapiEndpoint === "/chat/send/audio") {
          wuzapiPayload = {
            Phone: wuzapiPhone,
            Audio: audioData,
            Mimetype: isOpus ? "audio/ogg; codecs=opus" : finalMime,
            PTT: isOpus,
          };
          }
        } else if (message_type === "video" && resolvedInteractiveData) {
          wuzapiEndpoint = "/chat/send/video";
          const src = resolvedInteractiveData.url || resolvedInteractiveData;
          wuzapiPayload = { Phone: wuzapiPhone, Video: await toDataUri(src, "video/mp4"), Caption: content };
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
          // Prefix content with sender name if provided
          const waContent = bodySenderName ? `*${bodySenderName}:*\n${content}` : content;
          waPayload = { messaging_product: "whatsapp", to: phone, type: "text", text: { body: waContent } };
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
        sender_name: bodySenderName || "Atendente",
        external_id: externalMessageId,
        delivery_status: "sent",
        sync_source: "emmely",
        media_type: message_type && message_type !== "interactive_buttons" && message_type !== "interactive_list" ? message_type : null,
        media_url: (resolvedInteractiveData as any)?.url ?? null,
        ai_review_status: aiReviewStatus,
        ai_review_score: aiReviewScore,
        ai_review_id: aiReviewId,
        originated_by_agent_id: bodyAiAgentId ?? null,
      });

      // Marca a revisão como já entregue
      if (aiReviewId) {
        await supabase
          .from("ai_message_reviews")
          .update({ message_id: undefined, decided_at: new Date().toISOString() })
          .eq("id", aiReviewId);
      }


      // Register in dedup cache to prevent echo from webhooks
      if (externalMessageId) {
        await supabase.from("sync_dedup_cache").upsert({
          entity_type: "message",
          entity_id: conversation_id,
          external_id: externalMessageId,
          source: "emmely",
        }, { onConflict: "entity_type,external_id,source" }).then(() => {})
      }

      const updatePayload: any = {
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
      };

      // Persist CRM entity context in bot_state if provided
      if (bitrix_entity_id) {
        const entityPrefix = bitrix_entity_type_id ? `${bitrix_entity_type_id}:${bitrix_entity_id}` : bitrix_entity_id;
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("bot_state")
          .eq("id", conversation_id)
          .single();
        const existingState = (existingConv?.bot_state as any) || {};
        updatePayload.bot_state = {
          ...existingState,
          bitrix_entity_id: entityPrefix,
          ...(bitrix_entity_type_id === "2" ? { bitrix_deal_id: String(bitrix_entity_id) } : {}),
        };
        console.log(`[MESSAGE-SEND] Persisted CRM context: ${entityPrefix}`);

        // Also link lead.conversation_id if a matching lead exists
        await supabase
          .from("leads")
          .update({ conversation_id })
          .eq("bitrix24_id", String(bitrix_entity_id))
          .is("conversation_id", null)
          .then(() => {});
      }

      await supabase.from("conversations").update(updatePayload).eq("id", conversation_id);
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
