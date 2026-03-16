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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, service_id, name, value, currency, member_id } = await req.json();

    if (!action || !service_id) {
      return new Response(JSON.stringify({ error: "action and service_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the integration (use provided member_id or find active one)
    let integrationQuery = supabase.from("bitrix24_integrations").select("*");
    if (member_id) {
      integrationQuery = integrationQuery.eq("member_id", member_id);
    } else {
      integrationQuery = integrationQuery.limit(1);
    }
    const { data: integration } = await integrationQuery.single();

    if (!integration?.client_endpoint || !integration?.access_token) {
      return new Response(JSON.stringify({ error: "No active Bitrix24 integration found", skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endpoint = integration.client_endpoint;
    const accessToken = integration.access_token;

    const bitrixCall = async (method: string, payload: Record<string, any> = {}) => {
      const res = await fetch(`${endpoint}${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken, ...payload }),
      });
      return res.json();
    };

    // Get current service from DB
    const { data: service } = await supabase
      .from("services")
      .select("*")
      .eq("id", service_id)
      .single();

    if (!service && action !== "delete") {
      return new Response(JSON.stringify({ error: "Service not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentBitrixId = service?.bitrix24_id;

    if (action === "upsert") {
      const productFields: Record<string, any> = {
        NAME: name || service.name,
        PRICE: value ?? service.value ?? 0,
        CURRENCY_ID: (currency || service.currency || "EUR").toUpperCase(),
        ACTIVE: "Y",
        DESCRIPTION: service.budget_details || "",
      };

      if (currentBitrixId) {
        // Update existing product
        const res = await bitrixCall("crm.product.update", { id: currentBitrixId, fields: productFields });
        console.log(`[sync-product] Updated Bitrix24 product ${currentBitrixId}:`, res);

        return new Response(JSON.stringify({
          success: true,
          action: "updated",
          bitrix24_id: currentBitrixId,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        // Create new product
        const res = await bitrixCall("crm.product.add", { fields: productFields });
        const newBitrixId = res.result ? String(res.result) : null;
        console.log(`[sync-product] Created Bitrix24 product ${newBitrixId}:`, res);

        if (newBitrixId) {
          // Save bitrix24_id back to services table
          await supabase
            .from("services")
            .update({ bitrix24_id: newBitrixId })
            .eq("id", service_id);
        }

        return new Response(JSON.stringify({
          success: true,
          action: "created",
          bitrix24_id: newBitrixId,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (action === "delete") {
      if (currentBitrixId) {
        try {
          const res = await bitrixCall("crm.product.delete", { id: currentBitrixId });
          console.log(`[sync-product] Deleted Bitrix24 product ${currentBitrixId}:`, res);
        } catch (e) {
          console.warn(`[sync-product] Failed to delete Bitrix24 product ${currentBitrixId}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        action: "deleted",
        bitrix24_id: currentBitrixId || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[bitrix24-sync-product] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
