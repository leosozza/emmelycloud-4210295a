const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "connect-src *",
  "frame-ancestors *",
  "font-src * data:",
].join("; ");

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
  "X-Frame-Options": "ALLOWALL",
};

function contextMenuHtml(supabaseUrl: string, anonKey: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f8f9fa; color: #333; padding: 16px;
      min-height: 100vh;
    }
    .header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px;
    }
    .header-icon { font-size: 20px; }
    .header h1 { font-size: 14px; font-weight: 600; color: #1f2937; }
    .message-preview {
      background: white; border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 10px 14px; font-size: 12px; color: #6b7280;
      margin-bottom: 14px; max-height: 80px; overflow: hidden;
      line-height: 1.4;
    }
    .message-preview .label { font-weight: 600; color: #374151; margin-bottom: 4px; }
    .actions {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      margin-bottom: 14px;
    }
    .action-btn {
      background: white; border: 1px solid #d1d5db; border-radius: 8px;
      padding: 10px 12px; cursor: pointer; text-align: left;
      transition: all 0.15s;
    }
    .action-btn:hover { border-color: #6366f1; background: #eef2ff; }
    .action-btn.active { border-color: #6366f1; background: #eef2ff; }
    .action-btn .icon { font-size: 16px; margin-bottom: 4px; }
    .action-btn .label { font-size: 12px; font-weight: 500; color: #1f2937; }
    .action-btn .desc { font-size: 10px; color: #9ca3af; }
    .result-area {
      display: none; background: white; border: 1px solid #e5e7eb;
      border-radius: 8px; padding: 14px; margin-top: 10px;
    }
    .result-area.visible { display: block; }
    .result-area .result-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px;
    }
    .result-area .result-title { font-size: 12px; font-weight: 600; color: #4338ca; }
    .result-area .copy-btn {
      background: #6366f1; color: white; border: none; border-radius: 6px;
      padding: 4px 10px; font-size: 11px; cursor: pointer;
    }
    .result-area .copy-btn:hover { background: #4f46e5; }
    .result-area .result-content {
      font-size: 13px; line-height: 1.5; color: #374151;
      white-space: pre-wrap; max-height: 200px; overflow-y: auto;
    }
    .loading {
      display: none; text-align: center; padding: 20px; color: #9ca3af;
      font-size: 13px;
    }
    .loading.active { display: block; }
    .loading .spinner {
      display: inline-block; width: 20px; height: 20px;
      border: 2px solid #e5e7eb; border-top-color: #6366f1;
      border-radius: 50%; animation: spin 0.8s linear infinite;
      margin-bottom: 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-icon">🔍</span>
    <h1>Analisar com Emmely</h1>
  </div>

  <div class="message-preview" id="messagePreview">
    <div class="label">Mensagem selecionada:</div>
    <div id="messageText">A carregar...</div>
  </div>

  <div class="actions" id="actions">
    <button class="action-btn" onclick="runAction('summarize')">
      <div class="icon">📋</div>
      <div class="label">Resumir</div>
      <div class="desc">Resume o contexto</div>
    </button>
    <button class="action-btn" onclick="runAction('translate')">
      <div class="icon">🌐</div>
      <div class="label">Traduzir</div>
      <div class="desc">PT / EN / ES</div>
    </button>
    <button class="action-btn" onclick="runAction('suggest')">
      <div class="icon">💬</div>
      <div class="label">Sugerir Resposta</div>
      <div class="desc">Resposta profissional</div>
    </button>
    <button class="action-btn" onclick="runAction('sentiment')">
      <div class="icon">😊</div>
      <div class="label">Sentimento</div>
      <div class="desc">Analisa tom e emoção</div>
    </button>
  </div>

  <div class="loading" id="loading">
    <div class="spinner"></div>
    <div>Emmely está a analisar...</div>
  </div>

  <div class="result-area" id="resultArea">
    <div class="result-header">
      <span class="result-title" id="resultTitle">Resultado</span>
      <button class="copy-btn" onclick="copyResult()">📋 Copiar</button>
    </div>
    <div class="result-content" id="resultContent"></div>
  </div>

  <script>
    const SUPABASE_URL = "${supabaseUrl}";
    const ANON_KEY = "${anonKey}";
    let messageContent = "";

    const PROMPTS = {
      summarize: "Resume de forma concisa a seguinte mensagem e o contexto da conversa. Indica os pontos-chave e o que o cliente pretende:\\n\\n",
      translate: "Traduz a seguinte mensagem para Português, Inglês e Espanhol. Apresenta as 3 traduções de forma clara com os cabeçalhos 🇵🇹 PT, 🇬🇧 EN, 🇪🇸 ES:\\n\\n",
      suggest: "Com base na seguinte mensagem do cliente, sugere uma resposta profissional, empática e adequada. A resposta deve ser pronta a enviar:\\n\\n",
      sentiment: "Analisa o sentimento e tom da seguinte mensagem. Classifica como Positivo/Neutro/Negativo, identifica emoções presentes, e sugere como abordar o cliente:\\n\\n",
    };

    const TITLES = {
      summarize: "📋 Resumo",
      translate: "🌐 Tradução",
      suggest: "💬 Resposta Sugerida",
      sentiment: "😊 Análise de Sentimento",
    };

    try {
      BX24.init(function() {
        const opts = BX24.placement.options || {};
        messageContent = opts.MESSAGE || opts.message || opts.TEXT || "";
        console.log("[IM-CONTEXT-MENU] Placement options:", JSON.stringify(opts));
        document.getElementById("messageText").textContent = messageContent || "Sem conteúdo disponível";
      });
    } catch(e) {
      console.warn("[IM-CONTEXT-MENU] BX24 init failed:", e);
      document.getElementById("messageText").textContent = "Modo standalone";
    }

    async function runAction(action) {
      if (!messageContent) {
        alert("Nenhuma mensagem disponível para analisar.");
        return;
      }

      // Highlight active button
      document.querySelectorAll(".action-btn").forEach(b => b.classList.remove("active"));
      event.currentTarget.classList.add("active");

      document.getElementById("loading").classList.add("active");
      document.getElementById("resultArea").classList.remove("visible");

      const prompt = PROMPTS[action] + messageContent;

      try {
        const res = await fetch(SUPABASE_URL + "/functions/v1/ai-process-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + ANON_KEY,
          },
          body: JSON.stringify({
            message_text: "[Contexto: Análise interna para o operador. NÃO enviar ao cliente.]\\n" + prompt,
            skip_send: true,
          }),
        });

        const data = await res.json();
        const reply = data.reply || data.error || "Sem resposta.";

        document.getElementById("resultTitle").textContent = TITLES[action];
        document.getElementById("resultContent").textContent = reply;
        document.getElementById("resultArea").classList.add("visible");
      } catch (err) {
        document.getElementById("resultTitle").textContent = "⚠️ Erro";
        document.getElementById("resultContent").textContent = "Erro: " + err.message;
        document.getElementById("resultArea").classList.add("visible");
      } finally {
        document.getElementById("loading").classList.remove("active");
      }
    }

    function copyResult() {
      const text = document.getElementById("resultContent").textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector(".copy-btn");
        btn.textContent = "✅ Copiado!";
        setTimeout(() => { btn.textContent = "📋 Copiar"; }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    return new Response(contextMenuHtml(supabaseUrl, anonKey), { headers: htmlHeaders });
  } catch (e) {
    console.error("[IM-CONTEXT-MENU] Error:", e);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
