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

// SVG icons (Bitrix24 b24icons style: outline, stroke 1.5, currentColor)
const ICONS = {
  robot: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="1" y1="16" x2="3" y2="16"/><line x1="21" y1="16" x2="23" y2="16"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/></svg>`,
  message: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  clipboard: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  target: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  messageSuggest: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  smile: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  lightbulb: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>`,
  send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
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
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: #f5f7fa; color: #333840;
      display: flex; flex-direction: column; height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #2283d8, #7b5ea7);
      color: white; padding: 12px 16px;
      display: flex; align-items: center; gap: 10px;
    }
    .header-icon { display: flex; align-items: center; }
    .header h1 { font-size: 14px; font-weight: 600; }
    .header small { font-size: 11px; opacity: 0.85; display: block; }
    .context-bar {
      background: #e8f4fd; border-bottom: 1px solid #c4dff0;
      padding: 8px 12px; font-size: 12px; color: #2283d8;
      display: flex; align-items: center; gap: 6px;
    }
    .context-bar svg { flex-shrink: 0; }
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
      align-self: flex-end; background: #2283d8; color: white;
      border-bottom-right-radius: 4px;
    }
    .msg.assistant {
      align-self: flex-start; background: white; color: #333840;
      border: 1px solid #dfe0e3; border-bottom-left-radius: 4px;
    }
    .msg.system {
      align-self: center; background: #fef3c7; color: #92400e;
      font-size: 12px; border-radius: 8px; text-align: center;
    }
    .typing {
      align-self: flex-start; background: white; border: 1px solid #dfe0e3;
      padding: 10px 14px; border-radius: 12px; font-size: 13px; color: #959ca4;
      display: none;
    }
    .typing.active { display: block; }
    .input-area {
      border-top: 1px solid #dfe0e3; background: white;
      padding: 10px 12px; display: flex; gap: 8px; align-items: flex-end;
    }
    .input-area textarea {
      flex: 1; border: 1px solid #dfe0e3; border-radius: 8px;
      padding: 8px 12px; font-size: 13px; resize: none;
      font-family: inherit; outline: none; min-height: 38px; max-height: 100px;
      color: #333840;
    }
    .input-area textarea:focus { border-color: #2283d8; }
    .input-area button {
      background: #2283d8; color: white; border: none;
      border-radius: 8px; padding: 8px 12px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
    .input-area button:hover:not(:disabled) { background: #1b6cb8; }
    .suggestions {
      padding: 8px 12px; display: flex; gap: 6px; flex-wrap: wrap;
      border-top: 1px solid #f0f1f3; background: #fff;
    }
    .suggestions button {
      background: #f5f7fa; border: 1px solid #dfe0e3; border-radius: 6px;
      padding: 5px 10px; font-size: 11px; cursor: pointer; color: #333840;
      display: flex; align-items: center; gap: 4px; transition: all .15s;
    }
    .suggestions button:hover { background: #e8f4fd; border-color: #2283d8; color: #2283d8; }
    .empty-state {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; color: #959ca4;
      text-align: center; padding: 20px;
    }
    .empty-state .icon { margin-bottom: 12px; color: #c4cdd5; }
    .empty-state p { font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-icon">${ICONS.robot}</span>
    <div>
      <h1>Emmely AI Assistant</h1>
      <small>Consultoria interna — não envia ao cliente</small>
    </div>
  </div>
  <div class="context-bar" id="contextBar">
    ${ICONS.message} <span id="contextText">A carregar contexto...</span>
  </div>
  <div class="messages" id="messages">
    <div class="empty-state" id="emptyState">
      <div class="icon">${ICONS.lightbulb}</div>
      <p>Pergunte à Emmely sobre a conversa atual.<br>
      Ex: "Qual o melhor procedimento?" ou "Resume esta conversa"</p>
    </div>
  </div>
  <div class="typing" id="typing">Emmely está a analisar...</div>
  <div class="suggestions" id="suggestions">
    <button onclick="quickAsk('Resume a conversa atual e sugere o próximo passo')">${ICONS.clipboard} Resumir</button>
    <button onclick="quickAsk('Qual o melhor procedimento para este cliente?')">${ICONS.target} Procedimento</button>
    <button onclick="quickAsk('Sugere uma resposta profissional para este cliente')">${ICONS.messageSuggest} Sugerir resposta</button>
    <button onclick="quickAsk('Analisa o sentimento do cliente nesta conversa')">${ICONS.smile} Sentimento</button>
  </div>
  <div class="input-area">
    <textarea id="input" placeholder="Pergunte à Emmely..." rows="1"
      onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}"></textarea>
    <button id="sendBtn" onclick="sendMessage()">${ICONS.send}</button>
  </div>

  <script>
    const SUPABASE_URL = "${supabaseUrl}";
    const ANON_KEY = "${anonKey}";
    let dialogId = "";
    let chatId = "";
    let conversationHistory = [];

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
