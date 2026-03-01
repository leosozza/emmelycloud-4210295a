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

function sidebarHtml(supabaseUrl: string, anonKey: string): string {
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
      background: #f8f9fa; color: #333;
      display: flex; flex-direction: column; height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; padding: 12px 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .header-icon { font-size: 20px; }
    .header h1 { font-size: 14px; font-weight: 600; }
    .header small { font-size: 11px; opacity: 0.8; display: block; }
    .context-bar {
      background: #eef2ff; border-bottom: 1px solid #c7d2fe;
      padding: 8px 12px; font-size: 12px; color: #4338ca;
      display: flex; align-items: center; gap: 6px;
    }
    .messages {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .msg {
      max-width: 85%; padding: 10px 14px; border-radius: 12px;
      font-size: 13px; line-height: 1.5; word-wrap: break-word;
      white-space: pre-wrap;
    }
    .msg.user {
      align-self: flex-end; background: #6366f1; color: white;
      border-bottom-right-radius: 4px;
    }
    .msg.assistant {
      align-self: flex-start; background: white; color: #333;
      border: 1px solid #e5e7eb; border-bottom-left-radius: 4px;
    }
    .msg.system {
      align-self: center; background: #fef3c7; color: #92400e;
      font-size: 12px; border-radius: 8px; text-align: center;
    }
    .typing {
      align-self: flex-start; background: white; border: 1px solid #e5e7eb;
      padding: 10px 14px; border-radius: 12px; font-size: 13px; color: #9ca3af;
      display: none;
    }
    .typing.active { display: block; }
    .input-area {
      border-top: 1px solid #e5e7eb; background: white;
      padding: 10px 12px; display: flex; gap: 8px;
    }
    .input-area textarea {
      flex: 1; border: 1px solid #d1d5db; border-radius: 8px;
      padding: 8px 12px; font-size: 13px; resize: none;
      font-family: inherit; outline: none; min-height: 38px; max-height: 100px;
    }
    .input-area textarea:focus { border-color: #6366f1; }
    .input-area button {
      background: #6366f1; color: white; border: none;
      border-radius: 8px; padding: 8px 14px; cursor: pointer;
      font-size: 13px; font-weight: 500; white-space: nowrap;
    }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
    .input-area button:hover:not(:disabled) { background: #4f46e5; }
    .suggestions {
      padding: 8px 12px; display: flex; gap: 6px; flex-wrap: wrap;
      border-top: 1px solid #f3f4f6;
    }
    .suggestions button {
      background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 16px;
      padding: 4px 12px; font-size: 11px; cursor: pointer; color: #4b5563;
    }
    .suggestions button:hover { background: #e5e7eb; }
    .empty-state {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: #9ca3af;
      text-align: center; padding: 20px;
    }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
    .empty-state p { font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-icon">🤖</span>
    <div>
      <h1>Emmely AI Assistant</h1>
      <small>Consultoria interna — não envia ao cliente</small>
    </div>
  </div>
  <div class="context-bar" id="contextBar">
    💬 <span id="contextText">A carregar contexto...</span>
  </div>
  <div class="messages" id="messages">
    <div class="empty-state" id="emptyState">
      <div class="icon">💡</div>
      <p>Pergunte à Emmely sobre a conversa atual.<br>
      Ex: "Qual o melhor procedimento?" ou "Resume esta conversa"</p>
    </div>
  </div>
  <div class="typing" id="typing">Emmely está a analisar...</div>
  <div class="suggestions" id="suggestions">
    <button onclick="quickAsk('Resume a conversa atual e sugere o próximo passo')">📋 Resumir</button>
    <button onclick="quickAsk('Qual o melhor procedimento para este cliente?')">🎯 Procedimento</button>
    <button onclick="quickAsk('Sugere uma resposta profissional para este cliente')">💬 Sugerir resposta</button>
    <button onclick="quickAsk('Analisa o sentimento do cliente nesta conversa')">😊 Sentimento</button>
  </div>
  <div class="input-area">
    <textarea id="input" placeholder="Pergunte à Emmely..." rows="1"
      onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}"></textarea>
    <button id="sendBtn" onclick="sendMessage()">Enviar</button>
  </div>

  <script>
    const SUPABASE_URL = "${supabaseUrl}";
    const ANON_KEY = "${anonKey}";
    let dialogId = "";
    let chatId = "";
    let conversationHistory = [];

    // Init BX24 and extract placement options
    try {
      BX24.init(function() {
        const opts = BX24.placement.options || {};
        dialogId = opts.DIALOG_ID || opts.dialogId || "";
        chatId = opts.CHAT_ID || opts.ID || "";
        console.log("[IM-SIDEBAR] Placement options:", JSON.stringify(opts));
        updateContext();
      });
    } catch(e) {
      console.warn("[IM-SIDEBAR] BX24 init failed:", e);
      document.getElementById("contextText").textContent = "Modo standalone";
    }

    function updateContext() {
      const ctx = document.getElementById("contextText");
      if (dialogId) {
        ctx.textContent = "Chat: " + dialogId + (chatId ? " (ID: " + chatId + ")" : "");
      } else {
        ctx.textContent = "Nenhum chat selecionado";
      }
    }

    function addMessage(role, content) {
      const el = document.getElementById("emptyState");
      if (el) el.remove();

      const div = document.createElement("div");
      div.className = "msg " + role;
      div.textContent = content;
      document.getElementById("messages").appendChild(div);
      document.getElementById("messages").scrollTop = 999999;
      conversationHistory.push({ role, content });
    }

    function quickAsk(text) {
      document.getElementById("input").value = text;
      sendMessage();
    }

    async function sendMessage() {
      const input = document.getElementById("input");
      const text = input.value.trim();
      if (!text) return;

      input.value = "";
      addMessage("user", text);

      const sendBtn = document.getElementById("sendBtn");
      sendBtn.disabled = true;
      document.getElementById("typing").classList.add("active");

      // Build context prompt with dialog info
      const contextPrefix = dialogId
        ? "[Contexto: O operador está no chat " + dialogId + " do Bitrix24. Esta é uma consulta INTERNA — NÃO responda ao cliente. Ajude o operador a entender a situação e sugira o melhor procedimento.]\\n\\n"
        : "[Contexto: Consulta interna do operador. NÃO enviar ao cliente.]\\n\\n";

      try {
        const res = await fetch(SUPABASE_URL + "/functions/v1/ai-process-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + ANON_KEY,
          },
          body: JSON.stringify({
            message_text: contextPrefix + text,
            skip_send: true,
          }),
        });

        const data = await res.json();
        const reply = data.reply || data.error || "Sem resposta disponível.";
        addMessage("assistant", reply);
      } catch (err) {
        addMessage("system", "Erro ao contactar a IA: " + err.message);
      } finally {
        sendBtn.disabled = false;
        document.getElementById("typing").classList.remove("active");
        input.focus();
      }
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
    return new Response(sidebarHtml(supabaseUrl, anonKey), { headers: htmlHeaders });
  } catch (e) {
    console.error("[IM-SIDEBAR] Error:", e);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
