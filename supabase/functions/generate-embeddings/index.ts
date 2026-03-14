import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fix #1: This function is now DEPRECATED.
// The system uses native PostgreSQL Full-Text Search (search_chunks_fts RPC) instead of
// fake LLM-generated embeddings. This function is kept for backward compatibility
// but should NOT be used for new documents.
// The search_chunks_fts RPC uses to_tsvector/plainto_tsquery which requires no embeddings.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const documentId = body.document_id;

    // Instead of generating fake embeddings, just mark documents as ready
    // since we now use FTS (Full-Text Search) which doesn't need embeddings
    if (documentId) {
      await supabase
        .from("knowledge_documents")
        .update({ status: "ready" })
        .eq("id", documentId);

      const { count } = await supabase
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId);

      console.log(`[EMBEDDINGS] Document ${documentId} marked as ready (${count} chunks). Using FTS instead of embeddings.`);

      return new Response(JSON.stringify({
        processed: 0,
        errors: 0,
        skipped: count || 0,
        remaining: 0,
        batches: 0,
        message: "Using native PostgreSQL Full-Text Search. Embeddings not needed.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bulk mode: mark all pending documents as ready
    const { data: pendingDocs } = await supabase
      .from("knowledge_documents")
      .select("id")
      .in("status", ["pending", "processing"]);

    let updated = 0;
    if (pendingDocs && pendingDocs.length > 0) {
      const ids = pendingDocs.map((d: any) => d.id);
      await supabase
        .from("knowledge_documents")
        .update({ status: "ready" })
        .in("id", ids);
      updated = ids.length;
    }

    console.log(`[EMBEDDINGS] Marked ${updated} documents as ready. Using FTS instead of embeddings.`);

    return new Response(JSON.stringify({
      processed: 0,
      errors: 0,
      skipped: 0,
      remaining: 0,
      batches: 0,
      documents_updated: updated,
      message: "Using native PostgreSQL Full-Text Search. Embeddings not needed.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[EMBEDDINGS] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
