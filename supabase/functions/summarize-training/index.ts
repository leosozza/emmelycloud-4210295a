import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { collection_id, collection_name } = await req.json();
    if (!collection_id) {
      return new Response(JSON.stringify({ error: "collection_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get all documents in the collection
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("id, title, content, source_type, file_type")
      .eq("collection_id", collection_id);

    if (!docs || docs.length === 0) {
      return new Response(JSON.stringify({ summary: "", error: "No documents found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get all chunks for these documents
    const docIds = docs.map((d: any) => d.id);
    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("content, document_id")
      .in("document_id", docIds)
      .order("chunk_index", { ascending: true })
      .limit(100);

    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ summary: "Sem conteúdo extraído dos ficheiros." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Build context: group chunks by document
    const docMap = new Map<string, string>();
    for (const doc of docs) {
      docMap.set(doc.id, doc.title);
    }

    let contextText = "";
    for (const chunk of chunks) {
      const docTitle = docMap.get(chunk.document_id) || "Documento";
      contextText += `[${docTitle}]: ${chunk.content}\n\n`;
    }

    // Limit context to ~30k chars
    if (contextText.length > 30000) {
      contextText = contextText.substring(0, 30000) + "\n...(conteúdo truncado)";
    }

    // 4. Call AI to generate summary
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ summary: "", error: "AI not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um especialista em análise documental. Analise TODOS os conteúdos fornecidos abaixo e gere:

1. Um RESUMO COMPLETO e detalhado de todos os documentos, organizado por temas
2. Os PONTOS-CHAVE e informações mais importantes de cada documento
3. Uma SÍNTESE que conecte os temas entre si

O resumo deve ser completo o suficiente para que um assistente de IA consiga responder perguntas sobre o conteúdo sem precisar dos documentos originais.

Escreva em Português. Seja detalhado e abrangente. Use formatação com títulos e bullet points.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Treinamento: "${collection_name || "Sem nome"}"\n\nDocumentos (${docs.length} ficheiros, ${chunks.length} chunks):\n\n${contextText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI summary error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ summary: "", error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ summary: "", error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ summary: "", error: "AI error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content?.trim() || "";

    // 5. Find or create the text document in the collection and update it with the summary
    const textDoc = docs.find((d: any) => d.source_type === "text");

    if (textDoc) {
      // Update existing text doc
      await supabase.from("knowledge_documents").update({
        content: summary,
        status: "ready",
      }).eq("id", textDoc.id);

      // Re-chunk
      await supabase.from("knowledge_chunks").delete().eq("document_id", textDoc.id);
      const newChunks = chunkText(summary, 1000);
      const chunkInserts = newChunks.map((c: string, i: number) => ({
        document_id: textDoc.id,
        chunk_index: i,
        content: c,
        tokens_count: Math.ceil(c.length / 4),
      }));
      if (chunkInserts.length > 0) {
        await supabase.from("knowledge_chunks").insert(chunkInserts);
      }
      await supabase.from("knowledge_documents").update({
        chunks_count: newChunks.length,
      }).eq("id", textDoc.id);
    } else {
      // Create new text doc with the summary
      const { data: newDoc } = await supabase.from("knowledge_documents").insert({
        title: `Resumo: ${collection_name || "Treinamento"}`,
        content: summary,
        source_type: "text",
        status: "ready",
        collection_id,
        collection_name: collection_name || "Treinamento",
        chunks_count: 0,
      }).select().single();

      if (newDoc) {
        const newChunks = chunkText(summary, 1000);
        const chunkInserts = newChunks.map((c: string, i: number) => ({
          document_id: (newDoc as any).id,
          chunk_index: i,
          content: c,
          tokens_count: Math.ceil(c.length / 4),
        }));
        if (chunkInserts.length > 0) {
          await supabase.from("knowledge_chunks").insert(chunkInserts);
        }
        await supabase.from("knowledge_documents").update({
          chunks_count: newChunks.length,
        }).eq("id", (newDoc as any).id);
      }
    }

    console.log(`Summary generated for collection ${collection_id}: ${summary.length} chars`);

    return new Response(JSON.stringify({ summary, chunks: chunks.length, docs: docs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("summarize-training error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function chunkText(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > maxChars && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += (current ? " " : "") + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.substring(0, maxChars)];
}
