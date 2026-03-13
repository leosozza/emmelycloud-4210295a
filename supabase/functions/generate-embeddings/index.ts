import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 20;

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
    const documentId = body.document_id; // optional: process specific document only

    // Get chunks without embeddings
    let query = supabase
      .from("knowledge_chunks")
      .select("id, content, document_id")
      .is("embedding", null)
      .order("created_at")
      .limit(BATCH_SIZE);

    if (documentId) {
      query = query.eq("document_id", documentId);
    }

    const { data: chunks, error } = await query;
    if (error) throw error;
    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No chunks without embeddings" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let errors = 0;

    for (const chunk of chunks) {
      try {
        // Generate embedding via Lovable AI (use text-embedding-like approach via chat)
        // We use gemini-2.5-flash-lite to extract a semantic representation
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
                content: "Generate a semantic embedding representation of the following text. Return ONLY a JSON array of exactly 768 floating point numbers between -1 and 1 that represent the semantic meaning of the text. No explanation, no formatting, just the raw JSON array.",
              },
              { role: "user", content: chunk.content.substring(0, 2000) },
            ],
            temperature: 0,
          }),
        });

        if (!embeddingRes.ok) {
          const status = embeddingRes.status;
          if (status === 429) {
            console.log("[EMBEDDINGS] Rate limited, stopping batch");
            break;
          }
          if (status === 402) {
            console.log("[EMBEDDINGS] Credits exhausted, stopping");
            break;
          }
          errors++;
          continue;
        }

        const result = await embeddingRes.json();
        const content = result.choices?.[0]?.message?.content || "";

        // Parse the embedding array
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (!arrayMatch) {
          console.error(`[EMBEDDINGS] Failed to parse embedding for chunk ${chunk.id}`);
          errors++;
          continue;
        }

        const embedding = JSON.parse(arrayMatch[0]);
        if (!Array.isArray(embedding) || embedding.length !== 768) {
          console.error(`[EMBEDDINGS] Invalid embedding dimension: ${embedding.length} for chunk ${chunk.id}`);
          errors++;
          continue;
        }

        // Format as pgvector string
        const vectorStr = `[${embedding.join(",")}]`;

        const { error: updateErr } = await supabase
          .from("knowledge_chunks")
          .update({ embedding: vectorStr })
          .eq("id", chunk.id);

        if (updateErr) {
          console.error(`[EMBEDDINGS] Update error for chunk ${chunk.id}:`, updateErr);
          errors++;
        } else {
          processed++;
        }

        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.error(`[EMBEDDINGS] Error processing chunk ${chunk.id}:`, e);
        errors++;
      }
    }

    console.log(`[EMBEDDINGS] Processed: ${processed}, Errors: ${errors}, Total: ${chunks.length}`);

    return new Response(JSON.stringify({ processed, errors, total: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[EMBEDDINGS] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
