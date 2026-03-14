import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find integration - try member_id from query, or pick the first active one
    const url = new URL(req.url);
    const memberId = url.searchParams.get("member_id");

    let integration;
    if (memberId) {
      const { data } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", memberId)
        .single();
      integration = data;
    } else {
      const { data } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      integration = data;
    }

    if (!integration || !integration.client_endpoint || !integration.access_token) {
      return new Response(
        JSON.stringify({ error: "No active Bitrix24 integration found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ep = integration.client_endpoint;
    const auth = integration.access_token;

    // Fetch all active users from Bitrix24
    const users: any[] = [];
    let start = 0;

    while (true) {
      const resp = await fetch(`${ep}user.get?auth=${auth}&ACTIVE=true&start=${start}`);
      const data = await resp.json();

      if (data.error) {
        // Try token refresh if expired
        if (data.error === "expired_token" || data.error === "WRONG_TOKEN") {
          const refreshResp = await fetch(
            `https://oauth.bitrix.info/oauth/token/?grant_type=refresh_token&client_id=${Deno.env.get("BITRIX24_CLIENT_ID")}&client_secret=${Deno.env.get("BITRIX24_CLIENT_SECRET")}&refresh_token=${integration.refresh_token}`
          );
          const refreshData = await refreshResp.json();

          if (refreshData.access_token) {
            await supabase
              .from("bitrix24_integrations")
              .update({
                access_token: refreshData.access_token,
                refresh_token: refreshData.refresh_token,
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              })
              .eq("id", integration.id);

            // Retry with new token
            const retryResp = await fetch(`${ep}user.get?auth=${refreshData.access_token}&ACTIVE=true&start=${start}`);
            const retryData = await retryResp.json();
            if (retryData.result) {
              users.push(...retryData.result);
              if (!retryData.next) break;
              start = retryData.next;
              continue;
            }
          }
          return new Response(
            JSON.stringify({ error: "Token refresh failed" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: data.error_description || data.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (data.result) {
        users.push(...data.result);
      }

      if (!data.next) break;
      start = data.next;
    }

    // Map to a clean format
    const mapped = users.map((u: any) => ({
      id: String(u.ID),
      name: `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || u.EMAIL || `User ${u.ID}`,
      email: u.EMAIL || null,
      department: u.UF_DEPARTMENT || [],
      position: u.WORK_POSITION || null,
      active: u.ACTIVE,
      avatarUrl: u.PERSONAL_PHOTO || null,
    }));

    return new Response(
      JSON.stringify({ users: mapped, total: mapped.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("bitrix24-fetch-users error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
