import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Queue Worker — Otimizado para Concorrência ───────────────────────────────
//
// PROBLEMA ANTERIOR:
//   1. O worker fazia SELECT dos jobs e depois UPDATE para "processing" em
//      duas operações separadas. Com múltiplas invocações simultâneas (cron
//      a cada 5s + triggers), dois workers podiam pegar o mesmo job,
//      resultando em mensagens duplicadas enviadas ao cliente.
//   2. O lock de conversa era verificado em SELECT separado, sem atomicidade.
//
// NOVA ARQUITETURA:
//   1. Usa função RPC `claim_queue_jobs` com SELECT FOR UPDATE SKIP LOCKED
//      para garantir que apenas um worker processe cada job.
//   2. Lock de conversa é feito atomicamente via UPDATE ... WHERE ... RETURNING.
//   3. Timeout de lock reduzido para 20s (Edge Functions têm timeout de 30s).
//   4. Cleanup automático de jobs "processing" travados por mais de 60s.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEBOUNCE_MS = 2000;   // 2s debounce para agrupar mensagens rápidas
const MAX_BATCH = 10;       // máx. 10 conversas por invocação
const LOCK_TIMEOUT_MS = 20000; // 20s lock por conversa
const STUCK_JOB_MS = 60000;   // jobs "processing" por mais de 60s são liberados

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startTime = Date.now();

  try {
    // ── 0. Cleanup: liberar jobs travados em "processing" por mais de 60s ─────
    // Isso evita que falhas silenciosas bloqueiem a fila indefinidamente.
    const stuckCutoff = new Date(Date.now() - STUCK_JOB_MS).toISOString();
    const { count: releasedCount } = await supabase
      .from("message_queue")
      .update({ status: "pending", processing_at: null })
      .eq("status", "processing")
      .lt("processing_at", stuckCutoff)
      .select("id");

    if (releasedCount && releasedCount > 0) {
      console.log(`[QUEUE-WORKER] Released ${releasedCount} stuck jobs`);
    }

    // ── 1. Claim jobs atomicamente via RPC (SELECT FOR UPDATE SKIP LOCKED) ────
    const cutoff = new Date(Date.now() - DEBOUNCE_MS).toISOString();

    const { data: claimedJobs, error: claimError } = await supabase
      .rpc("claim_queue_jobs", {
        p_cutoff: cutoff,
        p_limit: MAX_BATCH * 5, // pegar mais para ter conversas suficientes após agrupamento
      });

    if (claimError) {
      // Fallback: se a RPC não existir ainda, usar o método antigo
      console.warn("[QUEUE-WORKER] claim_queue_jobs RPC not available, using fallback:", claimError.message);
      return await fallbackProcess(supabase, supabaseUrl, serviceKey, cutoff);
    }

    if (!claimedJobs || claimedJobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0, latency_ms: Date.now() - startTime }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Agrupar jobs por conversa (debounce) ───────────────────────────────
    const grouped = new Map<string, any[]>();
    for (const job of claimedJobs) {
      const key = job.conversation_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(job);
    }

    let processed = 0;
    const conversationIds = [...grouped.keys()].slice(0, MAX_BATCH);

    for (const conversationId of conversationIds) {
      const jobs = grouped.get(conversationId)!;

      // ── 3. Adquirir lock atômico na conversa ─────────────────────────────────
      // UPDATE ... WHERE processing_lock_at IS NULL OR < cutoff RETURNING id
      // Garante que apenas um worker processa a conversa por vez.
      const lockCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
      const { data: lockResult } = await supabase
        .from("conversations")
        .update({ processing_lock_at: new Date().toISOString() })
        .eq("id", conversationId)
        .or(`processing_lock_at.is.null,processing_lock_at.lt.${lockCutoff}`)
        .select("id")
        .single();

      if (!lockResult) {
        // Outro worker já tem o lock — liberar os jobs de volta para pending
        const jobIds = jobs.map((j: any) => j.id);
        await supabase.from("message_queue")
          .update({ status: "pending", processing_at: null })
          .in("id", jobIds);
        console.log(`[QUEUE-WORKER] Conversation ${conversationId} locked by another worker, skipping`);
        continue;
      }

      // ── 4. Mesclar mensagens (debounce grouping) ──────────────────────────────
      let mergedText: string;
      let interactiveResponse: any = null;
      let instanceId: string | null = null;
      const jobIds = jobs.map((j: any) => j.id);

      if (jobs.length === 1) {
        mergedText = jobs[0].message_text;
        interactiveResponse = jobs[0].interactive_response;
        instanceId = jobs[0].instance_id;
      } else {
        // Juntar mensagens em ordem cronológica
        const sorted = [...jobs].sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        mergedText = sorted.map((j: any) => j.message_text).join(" ");
        instanceId = sorted[sorted.length - 1].instance_id;
        interactiveResponse = sorted[sorted.length - 1].interactive_response;

        // Marcar mensagens agrupadas como completed (exceto a última)
        const groupedIds = sorted.slice(0, -1).map((j: any) => j.id);
        if (groupedIds.length > 0) {
          await supabase.from("message_queue")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .in("id", groupedIds);
        }

        console.log(`[QUEUE-WORKER] Grouped ${jobs.length} messages for conversation ${conversationId}: "${mergedText.slice(0, 80)}..."`);
      }

      // ── 5. Invocar o flow-engine ──────────────────────────────────────────────
      const lastJob = jobs[jobs.length - 1];
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
            message_type: lastJob.message_type || "text",
            interactive_response: interactiveResponse,
            instance_id: instanceId,
          }),
        });

        if (res.ok) {
          // Marcar o último job como completed
          await supabase.from("message_queue")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", jobIds[jobIds.length - 1]);

          console.log(`[QUEUE-WORKER] ✓ Processed conversation ${conversationId} (${jobs.length} msgs merged)`);
        } else {
          const errText = await res.text();
          throw new Error(`flow-engine ${res.status}: ${errText.slice(0, 200)}`);
        }
      } catch (e: any) {
        console.error(`[QUEUE-WORKER] ✗ Error processing conversation ${conversationId}:`, e.message);

        // Incrementar tentativas — se exceder max_attempts, marcar como failed
        for (const job of jobs) {
          const newAttempts = (job.attempts || 0) + 1;
          const maxAttempts = job.max_attempts || 3;
          const newStatus = newAttempts >= maxAttempts ? "failed" : "pending";

          await supabase.from("message_queue").update({
            status: newStatus,
            attempts: newAttempts,
            last_error: (e.message || "Unknown error").slice(0, 500),
            processing_at: null,
          }).eq("id", job.id);
        }
      } finally {
        // ── 6. Liberar o lock da conversa ─────────────────────────────────────
        await supabase.from("conversations")
          .update({ processing_lock_at: null })
          .eq("id", conversationId);
      }

      processed++;
    }

    const latencyMs = Date.now() - startTime;
    console.log(`[QUEUE-WORKER] Done: ${processed}/${conversationIds.length} conversations processed in ${latencyMs}ms`);

    return new Response(
      JSON.stringify({ processed, total_claimed: claimedJobs.length, latency_ms: latencyMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[QUEUE-WORKER] Fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Fallback: método antigo sem RPC (compatibilidade) ───────────────────────
async function fallbackProcess(supabase: any, supabaseUrl: string, serviceKey: string, cutoff: string) {
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
      headers: { "Content-Type": "application/json" },
    });
  }

  const grouped = new Map<string, any[]>();
  for (const job of pendingJobs) {
    if (!grouped.has(job.conversation_id)) grouped.set(job.conversation_id, []);
    grouped.get(job.conversation_id)!.push(job);
  }

  let processed = 0;
  for (const [conversationId, jobs] of grouped) {
    if (processed >= MAX_BATCH) break;

    const { data: conv } = await supabase
      .from("conversations")
      .select("processing_lock_at")
      .eq("id", conversationId)
      .single();

    if (conv?.processing_lock_at) {
      const lockAge = Date.now() - new Date(conv.processing_lock_at).getTime();
      if (lockAge < LOCK_TIMEOUT_MS) continue;
    }

    const jobIds = jobs.map((j: any) => j.id);
    await supabase.from("message_queue")
      .update({ status: "processing", processing_at: new Date().toISOString() })
      .in("id", jobIds);

    await supabase.from("conversations")
      .update({ processing_lock_at: new Date().toISOString() })
      .eq("id", conversationId);

    const mergedText = jobs.map((j: any) => j.message_text).join(" ");
    const lastJob = jobs[jobs.length - 1];

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_text: mergedText,
          message_type: lastJob.message_type || "text",
          interactive_response: lastJob.interactive_response,
          instance_id: lastJob.instance_id,
        }),
      });

      if (res.ok) {
        await supabase.from("message_queue")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .in("id", jobIds);
      } else {
        throw new Error(`flow-engine ${res.status}`);
      }
    } catch (e: any) {
      for (const job of jobs) {
        const newAttempts = (job.attempts || 0) + 1;
        await supabase.from("message_queue").update({
          status: newAttempts >= (job.max_attempts || 3) ? "failed" : "pending",
          attempts: newAttempts,
          last_error: e.message,
          processing_at: null,
        }).eq("id", job.id);
      }
    } finally {
      await supabase.from("conversations")
        .update({ processing_lock_at: null })
        .eq("id", conversationId);
    }

    processed++;
  }

  return new Response(JSON.stringify({ processed, fallback: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
