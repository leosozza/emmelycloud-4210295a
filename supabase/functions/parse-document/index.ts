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
    const { file_path, document_id } = await req.json();
    if (!file_path || !document_id) {
      return new Response(JSON.stringify({ error: "file_path and document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("knowledge-files")
      .download(file_path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      await supabase.from("knowledge_documents").update({ status: "ready", chunks_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Failed to download file", text: "", chunks: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = file_path.split(".").pop()?.toLowerCase() || "";
    let extractedText = "";

    if (ext === "pdf") {
      extractedText = await extractPdfText(fileData);
    } else if (ext === "docx") {
      extractedText = await extractDocxText(fileData);
    } else {
      try { extractedText = await fileData.text(); } catch { extractedText = ""; }
    }

    // Clean up
    extractedText = extractedText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    // AI fallback: if local parsing got very little text, use Gemini vision
    if ((ext === "pdf" || ext === "docx") && extractedText.length <= 100) {
      console.log(`Local parsing got ${extractedText.length} chars, trying AI fallback...`);
      const aiText = await extractWithAI(fileData, ext);
      if (aiText && aiText.length > extractedText.length) {
        extractedText = aiText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        console.log(`AI fallback extracted ${extractedText.length} chars`);
      }
    }

    if (!extractedText) {
      await supabase.from("knowledge_documents").update({ status: "ready", chunks_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({ text: "", chunks: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chunk the text
    const chunks = chunkText(extractedText, 1000);
    const chunkInserts = chunks.map((chunk, i) => ({
      document_id,
      chunk_index: i,
      content: chunk,
      tokens_count: Math.ceil(chunk.length / 4),
    }));

    await supabase.from("knowledge_chunks").delete().eq("document_id", document_id);

    if (chunkInserts.length > 0) {
      const { error: chunkError } = await supabase.from("knowledge_chunks").insert(chunkInserts);
      if (chunkError) console.error("Chunk insert error:", chunkError);
    }

    await supabase.from("knowledge_documents").update({
      content: extractedText.substring(0, 50000),
      status: "ready",
      chunks_count: chunks.length,
    }).eq("id", document_id);

    console.log(`Parsed ${ext} file: ${chunks.length} chunks, ${extractedText.length} chars`);

    // Auto-generate embeddings for new chunks
    try {
      fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ document_id }),
      }).catch(e => console.error("generate-embeddings call error:", e));
    } catch {}

    return new Response(JSON.stringify({ text: extractedText.substring(0, 500), chunks: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("parse-document error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
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

async function extractPdfText(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Extract text from BT...ET blocks (PDF text objects)
    const text = decodePdfStreams(bytes);
    if (text && text.length > 50) return text;

    // Fallback: extract raw strings
    return extractPdfRawStrings(bytes);
  } catch (e) {
    console.error("PDF extraction error:", e);
    return "";
  }
}

function decodePdfStreams(bytes: Uint8Array): string {
  const text: string[] = [];
  const decoder = new TextDecoder("latin1");
  const content = decoder.decode(bytes);
  
  const btPattern = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btPattern.exec(content)) !== null) {
    const block = match[1];
    // Tj operator
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjPattern.exec(block)) !== null) {
      text.push(decodePdfString(tjMatch[1]));
    }
    // TJ arrays
    const tjArrayPattern = /\[([^\]]*)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = tjArrayPattern.exec(block)) !== null) {
      const inner = arrMatch[1];
      const strPattern = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = strPattern.exec(inner)) !== null) {
        text.push(decodePdfString(strMatch[1]));
      }
    }
  }
  
  return text.join(" ").replace(/\s+/g, " ").trim();
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdfRawStrings(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const content = decoder.decode(bytes);
  const strings: string[] = [];
  const pattern = /\(([^\\)]{2,})\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const s = match[1].trim();
    if (s.length > 1 && /^[\x20-\x7E\xA0-\xFF]+$/.test(s)) {
      strings.push(decodePdfString(s));
    }
  }
  return strings.join(" ").replace(/\s+/g, " ").trim();
}

async function extractDocxText(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    const xmlContent = await findFileInZip(bytes, "word/document.xml");
    if (!xmlContent) return "";

    return xmlContent
      .replace(/<w:p[^>]*>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (e) {
    console.error("DOCX extraction error:", e);
    return "";
  }
}

async function findFileInZip(zipBytes: Uint8Array, targetName: string): Promise<string | null> {
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset < zipBytes.length - 4) {
    if (
      zipBytes[offset] === 0x50 &&
      zipBytes[offset + 1] === 0x4b &&
      zipBytes[offset + 2] === 0x03 &&
      zipBytes[offset + 3] === 0x04
    ) {
      const compressionMethod = zipBytes[offset + 8] | (zipBytes[offset + 9] << 8);
      const compressedSize = zipBytes[offset + 18] | (zipBytes[offset + 19] << 8) | (zipBytes[offset + 20] << 16) | (zipBytes[offset + 21] << 24);
      const fileNameLen = zipBytes[offset + 26] | (zipBytes[offset + 27] << 8);
      const extraLen = zipBytes[offset + 28] | (zipBytes[offset + 29] << 8);
      const fileName = decoder.decode(zipBytes.slice(offset + 30, offset + 30 + fileNameLen));
      const dataStart = offset + 30 + fileNameLen + extraLen;

      if (fileName === targetName) {
        const rawData = zipBytes.slice(dataStart, dataStart + compressedSize);
        if (compressionMethod === 0) {
          return decoder.decode(rawData);
        } else if (compressionMethod === 8) {
          try {
            const ds = new DecompressionStream("deflate-raw" as CompressionFormat);
            const writer = ds.writable.getWriter();
            writer.write(rawData);
            writer.close();
            const reader = ds.readable.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) chunks.push(value);
            }
            const totalLen = chunks.reduce((a, c) => a + c.length, 0);
            const result = new Uint8Array(totalLen);
            let pos = 0;
            for (const c of chunks) {
              result.set(c, pos);
              pos += c.length;
            }
            return decoder.decode(result);
           } catch (e) {
            console.error("Decompression error:", e);
            return null;
          }
        }
      }

      offset = dataStart + (compressedSize > 0 ? compressedSize : 1);
    } else {
      offset++;
    }
  }
  return null;
}

async function extractWithAI(blob: Blob, ext: string): Promise<string> {
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.error("LOVABLE_API_KEY not configured, skipping AI extraction");
      return "";
    }

    // Limit to 10MB
    if (blob.size > 10 * 1024 * 1024) {
      console.log("File too large for AI extraction (>10MB)");
      return "";
    }

    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL text from this document. Describe any images, charts, graphics and tables in detail. Return only the extracted content, no commentary.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const status = response.status;
      if (status === 429) console.error("AI rate limit exceeded");
      else if (status === 402) console.error("AI credits exhausted");
      else console.error(`AI gateway error: ${status}`);
      return "";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") console.error("AI extraction timed out (60s)");
    else console.error("AI extraction error:", e);
    return "";
  }
}
