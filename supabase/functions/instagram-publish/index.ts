import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_URL = "https://graph.instagram.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PAGE_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN");
    const APP_ID = Deno.env.get("META_APP_ID");
    if (!PAGE_TOKEN || !APP_ID) {
      return new Response(JSON.stringify({ error: "Instagram credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image_url, caption, media_type = "IMAGE" } = await req.json();

    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      access_token: PAGE_TOKEN,
    };

    if (media_type === "REELS" || media_type === "VIDEO") {
      containerParams.media_type = "REELS";
      containerParams.video_url = image_url;
    } else {
      containerParams.image_url = image_url;
    }

    if (caption) {
      containerParams.caption = caption;
    }

    const containerRes = await fetch(
      `${GRAPH_URL}/me/media?${new URLSearchParams(containerParams)}`,
      { method: "POST" }
    );
    const containerData = await containerRes.json();

    if (!containerRes.ok || !containerData.id) {
      console.error("Container creation failed:", JSON.stringify(containerData));
      return new Response(JSON.stringify({ error: "Failed to create media container", details: containerData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const containerId = containerData.id;

    // Step 2: For videos, wait for processing
    if (media_type === "REELS" || media_type === "VIDEO") {
      let status = "IN_PROGRESS";
      let attempts = 0;
      while (status === "IN_PROGRESS" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(
          `${GRAPH_URL}/${containerId}?fields=status_code&access_token=${PAGE_TOKEN}`
        );
        const statusData = await statusRes.json();
        status = statusData.status_code ?? "FINISHED";
        attempts++;
      }
      if (status !== "FINISHED") {
        return new Response(JSON.stringify({ error: "Video processing timed out", status }), {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(
      `${GRAPH_URL}/me/media_publish?creation_id=${containerId}&access_token=${PAGE_TOKEN}`,
      { method: "POST" }
    );
    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      console.error("Publish failed:", JSON.stringify(publishData));
      return new Response(JSON.stringify({ error: "Failed to publish", details: publishData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, media_id: publishData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Publish error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
