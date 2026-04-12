import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, file_type, document_type } = await req.json();
    if (!image_url) throw new Error("image_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isContract = document_type === "contrato";

    const systemPrompt = `You are a document layout analyzer specialized in legal documents (proposals, budgets, quotes, and contracts). Given an image of a document, extract the visual structure and return a JSON object with:
- layout_blocks: array of block objects with { id, type, visible, content, styles }
  - For proposals/quotes, type can be: "header", "client_info", "description", "services_table", "payment", "conditions", "text", "footer"
  - For contracts, additional types are available: "clauses", "signature", "witnesses"
    - "clauses" content: { items: [{ number: 1, title: "Objeto", text: "..." }, ...] }
    - "signature" content: { location: "Lisboa", showDate: true, partyA: "CONTRATANTE", partyB: "CONTRATADO" }
    - "witnesses" content: { count: 2 }
  - content depends on the type (e.g., header has companyName, tagline; text has title and text; payment has value details)
  - styles can include fontSize, textAlign etc
- header_color: hex color of the header/top section background
- accent_color: hex color used for accents/highlights
- company_name: company name found in the document
- company_tagline: tagline/slogan if found
- template_type: "proposta" or "contrato" based on the document content

IMPORTANT for contracts:
- Extract each clause as a separate item with number, title, and full text
- Use placeholders where appropriate: {cliente.nome}, {cliente.documento}, {cliente.morada}, {cliente.nacionalidade}, {valor}, {tipo_pagamento}, {parcelas}, {data}, {nome_contratante}, {nome_contratado}, {cliente.tratamento}
- Identify signature blocks and witness sections
- Preserve the legal language exactly as written

Generate block IDs using the pattern "type-N" (e.g., "header-1", "clauses-1").
Only return valid JSON, no markdown.`;

    const docTypeHint = isContract
      ? "This is a CONTRACT document. Extract all clauses, signature blocks, and witness sections."
      : "This is a PROPOSAL/QUOTE document. Extract the layout structure for recreating it as a template.";

    const userPrompt = `Analyze this document image and extract its layout structure as a template. ${docTypeHint}

The image URL is: ${image_url}

Return the JSON structure for recreating this document layout as a template editor configuration.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: image_url } },
        ],
      },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) throw new Error("Rate limit exceeded. Try again later.");
      if (aiRes.status === 402) throw new Error("Credits exhausted. Add funds in Settings.");
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Clean markdown fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const result = JSON.parse(content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-template-from-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
