/**
 * agent-heartbeat-runner/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes scheduled agent heartbeat tasks.
 * Called via pg_cron or external webhook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Get all active heartbeats that are due
    const now = new Date();
    const { data: heartbeats, error } = await supabase
      .from("agent_heartbeats")
      .select("*, ai_agents!inner(id, name, is_active)")
      .eq("is_active", true)
      .or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`);

    if (error) {
      console.error("[HEARTBEAT] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders });
    }

    if (!heartbeats || heartbeats.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: jsonHeaders });
    }

    const results: any[] = [];

    for (const hb of heartbeats) {
      const agent = (hb as any).ai_agents;
      if (!agent?.is_active) continue;

      console.log(`[HEARTBEAT] Running "${hb.name}" for agent "${agent.name}" (${hb.action_type})`);

      try {
        switch (hb.action_type) {
          case "run_flow": {
            const flowId = hb.action_config?.flow_id;
            if (flowId) {
              // Find a relevant conversation or create a system context
              await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                body: JSON.stringify({
                  conversation_id: hb.action_config.conversation_id || null,
                  message_text: `[HEARTBEAT] ${hb.name}`,
                  force_flow_id: flowId,
                }),
              });
            }
            break;
          }

          case "check_leads": {
            // Check leads without follow-up in configured hours
            const hoursThreshold = hb.action_config?.hours_threshold || 24;
            const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
            const { data: staleLeads } = await supabase
              .from("leads")
              .select("id, name, phone")
              .lt("updated_at", cutoff)
              .in("funnel_stage", ["lead", "contato_feito", "qualificacao"])
              .limit(10);

            if (staleLeads && staleLeads.length > 0) {
              console.log(`[HEARTBEAT] Found ${staleLeads.length} stale leads`);
              results.push({ heartbeat: hb.name, stale_leads: staleLeads.length });
            }
            break;
          }

          case "generate_report": {
            console.log(`[HEARTBEAT] Report generation for agent ${agent.name}`);
            break;
          }

          default:
            console.log(`[HEARTBEAT] Unknown action_type: ${hb.action_type}`);
        }

        // Calculate next run based on cron expression (simplified: add 24h for daily)
        const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await supabase
          .from("agent_heartbeats")
          .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
          .eq("id", hb.id);

        results.push({ heartbeat: hb.name, status: "ok" });
      } catch (e) {
        console.error(`[HEARTBEAT] Error running "${hb.name}":`, e);
        results.push({ heartbeat: hb.name, status: "error", error: String(e) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[HEARTBEAT] Fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});
