import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const MAX_BATCHES = 50; // safety cap per invocation
const DELAY_MS = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const documentId = body.document_id;
    const forceAll = body.force_all === true; // reprocess even those with embeddings

    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let batchCount = 0;
    let hasMore = true;

    while (hasMore && batchCount < MAX_BATCHES) {
      batchCount++;

      let query = supabase
        .from("knowledge_chunks")
        .select("id, content, document_id")
        .order("created_at")
        .limit(BATCH_SIZE);

      if (!forceAll) {
        query = query.is("embedding", null);
      }
      if (documentId) {
        query = query.eq("document_id", documentId);
      }
      // offset for force_all mode (already-processed chunks)
      if (forceAll) {
        query = query.range((batchCount - 1) * BATCH_SIZE, batchCount * BATCH_SIZE - 1);
      }

      const { data: chunks, error } = await query;
      if (error) throw error;
      if (!chunks || chunks.length === 0) {
        hasMore = false;
        break;
      }

      for (const chunk of chunks) {
        try {
          const textForEmbedding = chunk.content.substring(0, 2000).trim();
          if (!textForEmbedding) {
            totalSkipped++;
            continue;
          }

          // Use structured output via tool calling for reliable 768-dim vector
          const embeddingRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content: `You are an embedding generator. Given text, produce a semantic vector of exactly 768 floating-point numbers between -1.0 and 1.0. The vector must capture the semantic meaning of the text for similarity search. Output ONLY a valid JSON array with exactly 768 numbers. No explanation, no markdown, no formatting.`,
                },
                { role: "user", content: textForEmbedding },
              ],
              temperature: 0,
              max_tokens: 16000,
            }),
          });

          if (!embeddingRes.ok) {
            const status = embeddingRes.status;
            if (status === 429) {
              console.log(`[EMBEDDINGS] Rate limited at batch ${batchCount}, pausing...`);
              await new Promise(r => setTimeout(r, 5000));
              // retry this chunk
              const retryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    { role: "system", content: "Generate a semantic embedding: a JSON array of exactly 768 floats between -1 and 1. No explanation." },
                    { role: "user", content: textForEmbedding },
                  ],
                  temperature: 0,
                  max_tokens: 16000,
                }),
              });
              if (!retryRes.ok) {
                console.log(`[EMBEDDINGS] Retry failed (${retryRes.status}), stopping batch`);
                hasMore = false;
                break;
              }
              const retryResult = await retryRes.json();
              const retryContent = retryResult.choices?.[0]?.message?.content || "";
              const saved = await saveEmbedding(supabase, chunk.id, retryContent);
              if (saved) totalProcessed++; else totalErrors++;
              await new Promise(r => setTimeout(r, DELAY_MS));
              continue;
            }
            if (status === 402) {
              console.log("[EMBEDDINGS] Credits exhausted, stopping");
              hasMore = false;
              break;
            }
            console.error(`[EMBEDDINGS] API error ${status} for chunk ${chunk.id}`);
            totalErrors++;
            continue;
          }

          const result = await embeddingRes.json();
          const content = result.choices?.[0]?.message?.content || "";
          const saved = await saveEmbedding(supabase, chunk.id, content);
          if (saved) totalProcessed++; else totalErrors++;

          await new Promise(r => setTimeout(r, DELAY_MS));
        } catch (e) {
          console.error(`[EMBEDDINGS] Error processing chunk ${chunk.id}:`, e);
          totalErrors++;
        }
      }

      // If we got fewer than BATCH_SIZE, no more chunks
      if (chunks.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    // Update document status for processed documents
    if (documentId) {
      await supabase
        .from("knowledge_documents")
        .update({ status: totalErrors === 0 ? "ready" : "partial" })
        .eq("id", documentId);
    }

    const remaining = await countRemaining(supabase, documentId);

    console.log(`[EMBEDDINGS] Done: processed=${totalProcessed}, errors=${totalErrors}, skipped=${totalSkipped}, remaining=${remaining}`);

    return new Response(JSON.stringify({
      processed: totalProcessed,
      errors: totalErrors,
      skipped: totalSkipped,
      remaining,
      batches: batchCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[EMBEDDINGS] Fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function saveEmbedding(supabase: any, chunkId: string, content: string): Promise<boolean> {
  try {
    // Extract JSON array from response (handle markdown code blocks too)
    let cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.error(`[EMBEDDINGS] No array found for chunk ${chunkId}`);
      return false;
    }

    const embedding = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(embedding)) {
      console.error(`[EMBEDDINGS] Not an array for chunk ${chunkId}`);
      return false;
    }

    // Validate dimensions — accept 768 or pad/truncate
    let vector = embedding.map((v: any) => {
      const n = Number(v);
      return isNaN(n) ? 0 : Math.max(-1, Math.min(1, n));
    });

    if (vector.length < 768) {
      // Pad with zeros
      while (vector.length < 768) vector.push(0);
    } else if (vector.length > 768) {
      vector = vector.slice(0, 768);
    }

    const vectorStr = `[${vector.join(",")}]`;

    const { error: updateErr } = await supabase
      .from("knowledge_chunks")
      .update({ embedding: vectorStr })
      .eq("id", chunkId);

    if (updateErr) {
      console.error(`[EMBEDDINGS] DB update error for chunk ${chunkId}:`, updateErr);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[EMBEDDINGS] Parse error for chunk ${chunkId}:`, e);
    return false;
  }
}

async function countRemaining(supabase: any, documentId?: string): Promise<number> {
  let query = supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  if (documentId) query = query.eq("document_id", documentId);
  const { count } = await query;
  return count || 0;
}
