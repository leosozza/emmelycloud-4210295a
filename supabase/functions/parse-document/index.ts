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

    return new Response(JSON.stringify({ text: extractedText.substring(0, 500), chunks: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-document error:", error);
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
            const ds = new DecompressionStream("raw");
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
