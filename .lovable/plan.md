## Objetivo
1. Rebuilder o modal de gravação de áudio do placement `IM_TEXTAREA` (e variante `Lines`) com visual moderno alinhado ao app.
2. Corrigir o bug em que o áudio enviado para o WhatsApp não corresponde ao gravado.

## Diagnóstico do bug de envio

A função `supabase/functions/bitrix24-im-send-audio/index.ts` hoje:

1. Recebe o blob gravado e o upa em `media/bitrix-audio/{conv.id}/{ts}.{ext}` mantendo o MIME original (`audio/ogg;codecs=opus` ou `audio/webm`).
2. Resolve a conversa por `bitrix_chat_id = numeric(dialog_id)`.
3. Chama `message-send` com `resolvedInteractiveData: { url, filename, mime }` e `message_type: "audio"`.

Pontos suspeitos identificados:

- **Resolução de conversa frágil**: usa só `bitrix_chat_id`. Em chats multi-canal/Lines o dialog vem como `chat<openline_id>` que pode não bater 1‑para‑1 com `conversations.bitrix_chat_id` → pode resolver conversa errada (ou nenhuma e o erro passar como sucesso visual). Precisa também tentar `bitrix_lines_chat_id` / casar por contato do placement.
- **Sem logs do `bitrix24-im-send-audio` recentes** apesar do usuário ter testado → indica que o request POST `multipart` talvez nem esteja chegando à função (placement Bitrix carrega via POST `application/x-www-form-urlencoded` e o `fetch(window.location.pathname, …)` no iframe pode estar resolvendo errado dentro do sandbox do Bitrix).
- **`window.location.pathname`** dentro do iframe Bitrix vira `/functions/v1/bitrix24-im-send-audio` mas a origem pode ser `app.bitrix24.com` (proxy), gerando 404 silencioso → áudio não enviado e mensagem antiga reaparecendo.

## Plano

### 1. UI nova do modal (arquivo `supabase/functions/bitrix24-im-send-audio/index.ts`)

Substituir o `htmlPage()` por um layout moderno equivalente ao `ChatInput.tsx` do app:

- Tipografia `-apple-system, Inter` + paleta limpa (fundo `#fff` claro, bordas suaves `#e5e7eb`, primary `#2563eb`, destrutivo `#ef4444`, sucesso `#16a34a`).
- Estados visuais distintos:
  - **Idle**: botão único circular grande com ícone 🎙️ + texto "Toque para gravar".
  - **Gravando**: ponto pulsante vermelho + timer `MM:SS` + botões "Parar" e "Cancelar".
  - **Pré‑escuta**: player `<audio>` estilizado + botões "Descartar" e "Enviar áudio".
  - **Enviando**: spinner + "Enviando…".
- Animações CSS (pulse, fade-in), ícones inline em SVG (sem dependência externa), suporte a `prefers-color-scheme: dark`.
- `BX24.fitWindow()` chamado em cada mudança de estado para o popup do Bitrix se ajustar.

### 2. Robustez no envio (mesma função)

- Trocar `fetch(window.location.pathname, ...)` por **URL absoluta da Edge Function** (passada via template literal no HTML usando `SUPABASE_URL`), evitando 404 dentro do iframe Bitrix.
- Adicionar `console.log` detalhados (dialog_id recebido, conv encontrada, tamanho do blob, mime, path no storage) para futuras auditorias.
- Capturar `placementInfo.options.CHAT_ID` e `placementInfo.options.DIALOG_ID` (variam por placement) e enviar **ambos** como `dialog_id` e `chat_id`.

### 3. Resolução de conversa mais segura (`resolveConversation`)

Buscar em ordem, parando no primeiro match:
1. `bitrix_chat_id = numeric(dialog_id)`
2. `bitrix_lines_chat_id = numeric(dialog_id)` (quando coluna existir; caso contrário ignorar)
3. Fallback: usar `placementInfo.options.USER_ID`/`CONTACT_ID` para buscar via `bitrix_contact_id`.

Se nenhum resolver, **retornar 404 explícito** e o frontend mostrar erro vermelho ("Conversa não vinculada — abra o chat pelo painel Emmely").

### 4. Smoke test

Após deploy, abrir o chat `/atendimento/5511978659280` no Bitrix → gravar 3s → enviar → conferir no log de `bitrix24-im-send-audio` que `conv.id` bate com a conversa atual e que o `mediaUrl` é o áudio recém upado. Repetir o teste, confirmar que cada envio tem path único e que o WhatsApp recebe o áudio correto.

## Arquivos afetados
- `supabase/functions/bitrix24-im-send-audio/index.ts` (UI + resolveConversation + URL absoluta + logs)

Nenhuma migração de banco necessária.
