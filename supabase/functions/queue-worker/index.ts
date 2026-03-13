import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEBOUNCE_MS = 2000; // 2 second debounce for grouping rapid messages
const MAX_BATCH = 10;     // Process max 10 jobs per invocation

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Group pending messages by conversation (debounce)
    const cutoff = new Date(Date.now() - DEBOUNCE_MS).toISOString();

    // Get distinct conversations with pending messages older than debounce window
    const { data: pendingJobs } = await supabase
      .from("message_queue")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(50);

    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by conversation_id
    const grouped = new Map<string, typeof pendingJobs>();
    for (const job of pendingJobs) {
      const key = job.conversation_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(job);
    }

    let processed = 0;

    for (const [conversationId, jobs] of grouped) {
      if (processed >= MAX_BATCH) break;

      // 2. Check if conversation is already being processed (lock)
      const { data: conv } = await supabase
        .from("conversations")
        .select("processing_lock_at")
        .eq("id", conversationId)
        .single();

      if (conv?.processing_lock_at) {
        const lockAge = Date.now() - new Date(conv.processing_lock_at).getTime();
        if (lockAge < 30000) { // 30s lock window
          console.log(`[QUEUE-WORKER] Conversation ${conversationId} locked, skipping`);
          continue;
        }
      }

      // 3. Mark all jobs as processing
      const jobIds = jobs.map(j => j.id);
      await supabase.from("message_queue")
        .update({ status: "processing", processing_at: new Date().toISOString() })
        .in("id", jobIds);

      // 4. Merge messages into one (debounce grouping)
      let mergedText: string;
      let interactiveResponse: any = null;
      let instanceId: string | null = null;

      if (jobs.length === 1) {
        mergedText = jobs[0].message_text;
        interactiveResponse = jobs[0].interactive_response;
        instanceId = jobs[0].instance_id;
      } else {
        // Group rapid messages: mark extras as "grouped", process combined
        mergedText = jobs.map(j => j.message_text).join(" ");
        instanceId = jobs[jobs.length - 1].instance_id;

        // Mark grouped messages
        const groupedIds = jobIds.slice(0, -1);
        if (groupedIds.length > 0) {
          await supabase.from("message_queue")
            .update({ status: "grouped" })
            .in("id", groupedIds);
        }

        console.log(`[QUEUE-WORKER] Grouped ${jobs.length} messages for conversation ${conversationId}`);
      }

      // 5. Call flow-engine
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            message_text: mergedText,
            message_type: jobs[jobs.length - 1].message_type || "text",
            interactive_response: interactiveResponse,
            instance_id: instanceId,
          }),
        });

        if (res.ok) {
          // Mark last job as completed
          await supabase.from("message_queue")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", jobIds[jobIds.length - 1]);
        } else {
          const errText = await res.text();
          throw new Error(`flow-engine ${res.status}: ${errText}`);
        }
      } catch (e: any) {
        console.error(`[QUEUE-WORKER] Error processing conversation ${conversationId}:`, e);

        // Increment attempts, check if max reached
        for (const job of jobs) {
          const newAttempts = (job.attempts || 0) + 1;
          const newStatus = newAttempts >= (job.max_attempts || 3) ? "failed" : "pending";
          await supabase.from("message_queue").update({
            status: newStatus,
            attempts: newAttempts,
            last_error: e.message || "Unknown error",
            processing_at: null,
          }).eq("id", job.id);
        }
      }

      processed++;
    }

    return new Response(JSON.stringify({ processed, total_pending: pendingJobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[QUEUE-WORKER] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
