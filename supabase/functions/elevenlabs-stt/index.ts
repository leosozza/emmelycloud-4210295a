import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map ISO 639-3 / common aliases → ISO 639-1 for ElevenLabs
const LANG_MAP: Record<string, string> = {
  por: "pt",
  eng: "en",
  spa: "es",
  fra: "fr",
  deu: "de",
  ita: "it",
};

function normalizeLanguage(code: string): string {
  if (!code) return "pt";
  const lower = code.toLowerCase();
  return LANG_MAP[lower] ?? lower;
}

async function transcribeWithLovableAI(audioBytes: Uint8Array, mime: string, languageCode: string): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < audioBytes.length; i += chunkSize) {
    binary += String.fromCharCode(...audioBytes.subarray(i, i + chunkSize));
  }
  const dataUrl = `data:${mime || "audio/ogg"};base64,${btoa(binary)}`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      messages: [
        { role: "system", content: "Transcreva o áudio exatamente como falado. Responda apenas com a transcrição, sem comentários." },
        {
          role: "user",
          content: [
            { type: "text", text: `Idioma esperado: ${normalizeLanguage(languageCode)}. Transcreva este áudio.` },
            { type: "file", file: { file_data: dataUrl, mime_type: mime || "audio/ogg" } },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    console.warn("[elevenlabs-stt] Lovable AI fallback failed:", aiRes.status, await aiRes.text());
    return null;
  }
  const aiData = await aiRes.json().catch(() => null);
  return aiData?.choices?.[0]?.message?.content?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { audio_url, audio_base64, language_code = "pt", mime_type = "audio/ogg" } = body;

    let audioBytes: Uint8Array;
    let resolvedMime = mime_type;

    if (audio_base64) {
      // Strip data URI prefix if present (e.g. "data:audio/ogg;base64,...")
      let b64 = audio_base64 as string;
      const dataUriMatch = b64.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        resolvedMime = dataUriMatch[1];
        b64 = dataUriMatch[2];
      }
      const binStr = atob(b64);
      audioBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        audioBytes[i] = binStr.charCodeAt(i);
      }
    } else if (audio_url) {
      const audioRes = await fetch(audio_url);
      if (!audioRes.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch audio: ${audioRes.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      resolvedMime = audioRes.headers.get("content-type") || mime_type;
      audioBytes = new Uint8Array(await audioRes.arrayBuffer());
    } else {
      return new Response(
        JSON.stringify({ error: "Provide audio_url or audio_base64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get ElevenLabs API key. If it is not configured, use Lovable AI as fallback.
    const { data: cred } = await supabase
      .from("integration_credentials")
      .select("credential_value")
      .eq("provider", "elevenlabs")
      .eq("credential_key", "api_key")
      .single();

    const apiKey = cred?.credential_value?.trim();
    if (!apiKey) {
      const fallbackText = await transcribeWithLovableAI(audioBytes, resolvedMime, language_code);
      if (fallbackText) {
        return new Response(JSON.stringify({ text: fallbackText, provider: "lovable" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "No transcription provider available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ext = resolvedMime.includes("ogg") ? "ogg"
      : resolvedMime.includes("webm") ? "webm"
      : resolvedMime.includes("mp4") || resolvedMime.includes("m4a") ? "m4a"
      : resolvedMime.includes("wav") ? "wav"
      : resolvedMime.includes("mp3") || resolvedMime.includes("mpeg") ? "mp3"
      : "ogg";

    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("language_code", normalizeLanguage(language_code));
    form.append(
      "audio",
      new Blob([audioBytes], { type: resolvedMime }),
      `audio.${ext}`
    );

    const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      console.error("[elevenlabs-stt] API error:", sttRes.status, errText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs STT error: ${sttRes.status}`, detail: errText }),
        { status: sttRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sttRes.json();
    const text = result.text || result.transcript || "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[elevenlabs-stt] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
