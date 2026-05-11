// Backfill missing media for inbound messages by pulling Bitrix24 Open Channel history.
// Body: { dryRun?: boolean, limit?: number, conversation_id?: uuid, chatId?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FileEntry = {
  id: number;
  type: string;
  name: string;
  ext: string;
  date: number;
  urldownload: string;
};

function normalizeKind(t?: string | null): "audio" | "image" | "video" | "document" | null {
  const x = (t || "").toLowerCase();
  if (!x) return null;
  if (x.includes("audio") || x === "ptt" || x === "voice") return "audio";
  if (x.includes("image") || x.includes("sticker") || x === "photo") return "image";
  if (x.includes("video")) return "video";
  if (x.includes("doc") || x.includes("file") || x === "pdf") return "document";
  return null;
}

function extToMime(ext: string, kind: string): string {
  const e = (ext || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", wav: "audio/wav",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  if (map[e]) return map[e];
  if (kind === "audio") return "audio/ogg";
  if (kind === "image") return "image/jpeg";
  if (kind === "video") return "video/mp4";
  return "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun: boolean = body.dryRun === true;
    const limit: number = Math.min(Number(body.limit) || 200, 500);
    const onlyConv: string | null = body.conversation_id || null;
    const onlyChat: string | null = body.chatId || null;

    // Bitrix integration
    const { data: integration } = await supabase
      .from("bitrix24_integrations")
      .select("id, client_endpoint, access_token, refresh_token")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration?.client_endpoint || !integration?.access_token) {
      return new Response(JSON.stringify({ error: "no bitrix integration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ep = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
    let authToken: string = integration.access_token;

    async function refreshToken(): Promise<boolean> {
      try {
        const r = await fetch("https://oauth.bitrix.info/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: Deno.env.get("BITRIX24_CLIENT_ID")!,
            client_secret: Deno.env.get("BITRIX24_CLIENT_SECRET")!,
            refresh_token: integration.refresh_token!,
          }),
        });
        const j = await r.json();
        if (j.error || !j.access_token) return false;
        authToken = j.access_token;
        await supabase.from("bitrix24_integrations").update({
          access_token: j.access_token,
          refresh_token: j.refresh_token,
          expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
        }).eq("id", integration.id);
        return true;
      } catch { return false; }
    }

    async function bitrixCall(method: string, body: Record<string, any>): Promise<any> {
      const url = (t: string) => `${ep}${method}?auth=${encodeURIComponent(t)}`;
      let r = await fetch(url(authToken), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      let j = await r.json();
      if (j?.error === "expired_token") {
        if (await refreshToken()) {
          r = await fetch(url(authToken), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          j = await r.json();
        }
      }
      return j;
    }

    // Find target messages
    let q = supabase
      .from("messages")
      .select("id, conversation_id, media_type, content, created_at, conversations!inner(bitrix_chat_id)")
      .eq("direction", "inbound")
      .is("media_url", null)
      .not("media_type", "is", null)
      .not("conversations.bitrix_chat_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (onlyConv) q = q.eq("conversation_id", onlyConv);

    const { data: msgs, error: qerr } = await q;
    if (qerr) {
      return new Response(JSON.stringify({ error: qerr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!msgs?.length) {
      return new Response(JSON.stringify({ ok: true, total: 0, matched: 0, updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by chat
    const byChat = new Map<string, any[]>();
    for (const m of msgs as any[]) {
      const cid = m.conversations?.bitrix_chat_id;
      if (!cid) continue;
      if (onlyChat && cid !== onlyChat) continue;
      if (!byChat.has(cid)) byChat.set(cid, []);
      byChat.get(cid)!.push(m);
    }

    let matchedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];
    const samples: any[] = [];

    for (const [chatId, chatMsgs] of byChat.entries()) {
      // Pull history
      let history: any;
      try {
        const url = `${ep}imopenlines.session.history.get?auth=${encodeURIComponent(integration.access_token)}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ CHAT_ID: parseInt(chatId) }),
        });
        history = await r.json();
      } catch (e) {
        errors.push(`chat ${chatId}: ${(e as Error).message}`);
        continue;
      }

      const filesObj = history?.result?.files || {};
      const messagesObj = history?.result?.message || {};

      // Build messageId -> fileIds
      const msgFileMap = new Map<string, number[]>();
      for (const [mid, m] of Object.entries<any>(messagesObj)) {
        const fids: number[] = m?.params?.fileId || m?.params?.FILE_ID || [];
        if (Array.isArray(fids) && fids.length) msgFileMap.set(mid, fids);
      }

      // Build files index by kind, sorted by date
      const filesByKind: Record<string, FileEntry[]> = { audio: [], image: [], video: [], document: [] };
      for (const [fidStr, f] of Object.entries<any>(filesObj)) {
        const kind = normalizeKind(f.type) || "document";
        const date = f.date ? new Date(f.date).getTime() : 0;
        filesByKind[kind].push({
          id: Number(fidStr),
          type: f.type,
          name: f.name || `file_${fidStr}`,
          ext: f.extension || "",
          date,
          urldownload: f.urldownload || f.urlpreview || "",
        });
      }
      for (const k of Object.keys(filesByKind)) filesByKind[k].sort((a, b) => a.date - b.date);

      // Match each missing message to closest unused file of same kind within ±5min
      const used = new Set<number>();
      for (const m of chatMsgs) {
        const kind = normalizeKind(m.media_type);
        if (!kind) continue;
        const target = new Date(m.created_at).getTime();
        const candidates = filesByKind[kind] || [];
        let best: FileEntry | null = null;
        let bestDiff = Infinity;
        for (const f of candidates) {
          if (used.has(f.id)) continue;
          if (!f.urldownload) continue;
          const d = Math.abs(f.date - target);
          if (d < bestDiff && d <= 5 * 60 * 1000) {
            best = f;
            bestDiff = d;
          }
        }
        if (!best) continue;
        used.add(best.id);
        matchedCount++;
        samples.push({ msgId: m.id, fileId: best.id, kind, name: best.name, diffSec: Math.round(bestDiff / 1000) });

        if (dryRun) continue;

        // Download file
        try {
          const dl = await fetch(best.urldownload, { redirect: "follow" });
          if (!dl.ok) {
            errors.push(`msg ${m.id}: download HTTP ${dl.status}`);
            continue;
          }
          const buf = new Uint8Array(await dl.arrayBuffer());
          const mime = extToMime(best.ext || (best.name.split(".").pop() || ""), kind);
          const safeName = `bitrix-${chatId}-${best.id}.${best.ext || "bin"}`.replace(/[^\w.\-]/g, "_");
          const path = `backfill/${m.conversation_id}/${safeName}`;

          const up = await supabase.storage.from("media").upload(path, buf, {
            contentType: mime,
            upsert: true,
          });
          if (up.error) {
            errors.push(`msg ${m.id}: upload ${up.error.message}`);
            continue;
          }
          const pub = supabase.storage.from("media").getPublicUrl(path);
          const publicUrl = pub.data.publicUrl;

          const { error: updErr } = await supabase
            .from("messages")
            .update({ media_url: publicUrl, content: best.name })
            .eq("id", m.id);
          if (updErr) {
            errors.push(`msg ${m.id}: update ${updErr.message}`);
            continue;
          }
          updatedCount++;
        } catch (e) {
          errors.push(`msg ${m.id}: ${(e as Error).message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: msgs.length,
      chats: byChat.size,
      matched: matchedCount,
      updated: updatedCount,
      dryRun,
      errors: errors.slice(0, 50),
      samples: samples.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
