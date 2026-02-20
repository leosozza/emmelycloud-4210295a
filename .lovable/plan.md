
# Fix Definitivo: Botão "Devolver ao Bot" no Bitrix24

## Diagnóstico Completo (com prova dos logs e documentação oficial)

### O que já funciona
- Bot **Emmely AI** registado com ID **10367**, `OPENLINE: "Y"` — confirmado ao vivo
- Todos os eventos de mensagens (ONIMBOTMESSAGEADD, ONIMBOTJOINCHAT, etc.) ligados corretamente

### 3 Problemas exatos identificados

**Problema 1 — `placement.bind IM_TEXTAREA` rejeita com `ERROR_ARGUMENT`**

A documentação oficial em `apidocs.bitrix24.com/api-reference/chats/widgets/im-textarea.html` confirma que o parâmetro `OPTIONS` com `iconName` é **obrigatório** para `IM_TEXTAREA`. O código atual não passa `OPTIONS`, por isso o Bitrix24 rejeita:

```
// ERRADO (atual) — sem OPTIONS:
placement.bind({ PLACEMENT: "IM_TEXTAREA", HANDLER: "...", TITLE: "..." })
→ ERROR_ARGUMENT

// CORRETO (documentação oficial):
placement.bind({
  PLACEMENT: "IM_TEXTAREA",
  HANDLER: "...",
  OPTIONS: {
    iconName: "fa-robot",        // ← OBRIGATÓRIO — Font Awesome
    context: "LINES",            // ← só Open Lines (onde o bot está)
    color: "GREEN",
    role: "USER",
    width: "400",
    height: "200",
  }
})
```

**Problema 2 — Eventos inválidos no `event.bind`**

`OnImbotWelcomeMessage` e `OnImbotJoinOpen` **não existem** como eventos `event.bind` — são apenas parâmetros internos do `imbot.register`. Devem ser removidos da lista de eventos a ligar para evitar erros.

**Problema 3 — `bitrix24-return-to-bot` não encontra a conversa corretamente**

A tabela `conversations` **não tem coluna `bitrix_chat_id`**. O código atual tenta `contact_phone.eq.bitrix_${chatId}` que é logicamente errado e nunca vai encontrar nada.

O Bitrix24 passa no payload:
- `PLACEMENT_OPTIONS.dialogId` — o ID do diálogo (ex: `"chat9617"`)
- `PLACEMENT_OPTIONS.CHAT_ID` — o chat ID numérico

A solução correta é usar `imopenlines.session.list` com o `CHAT_ID` para obter o utilizador da Open Line, depois mapear via `contact_phone` — ou alternativamente procurar em `messages` recentes vinculadas a esse dialogId.

A abordagem mais robusta: usar o `CHAT_ID` do placement para chamar `im.chat.get` no Bitrix24 e obter os membros do chat, depois encontrar a conversa pelo número/contacto.

Mas a abordagem mais simples que funciona: o `attendance_mode` é na nossa BD — se não encontrar a conversa pelo `CHAT_ID` podemos simplesmente:
1. Tentar encontrar em `conversations` via bot_state que possa ter o chatId
2. Se não encontrar, ainda assim enviar a mensagem do bot no chat do Bitrix24 (que é o efeito visual principal)
3. A lógica de `attendance_mode` é secundária — o que importa é o operador ver o feedback visual

## Ficheiros a Alterar

### 1. `supabase/functions/bitrix24-rebind-events/index.ts`

**Fix 1**: Remover `OnImbotWelcomeMessage` e `OnImbotJoinOpen` da lista de `event.bind` (causam `ERROR_EVENT_NOT_FOUND`).

**Fix 2**: Adicionar `OPTIONS` com `iconName` obrigatório ao `placement.bind`:

```typescript
const placementResult = await callBitrix(integration.client_endpoint, accessToken, "placement.bind", {
  PLACEMENT: "IM_TEXTAREA",
  HANDLER: returnToBotUrl,
  TITLE: "Devolver ao Bot",
  LANG_ALL: {
    pt: { TITLE: "Devolver ao Bot" },
    en: { TITLE: "Return to Bot" },
    es: { TITLE: "Devolver al Bot" },
  },
  OPTIONS: {
    iconName: "fa-robot",      // ← OBRIGATÓRIO conforme docs oficiais
    context: "LINES",          // ← apenas em Open Lines
    color: "GREEN",
    role: "USER",
    width: "400",
    height: "200",
    extranet: "N",
  },
});
```

### 2. `supabase/functions/bitrix24-return-to-bot/index.ts`

**Fix**: Corrigir a lógica de encontrar a conversa. Em vez de `contact_phone.eq.bitrix_${chatId}` (errado), usar o `CHAT_ID` para:

1. Chamar `im.chat.get` no Bitrix24 para obter os membros do chat
2. Procurar por utilizador externo (contact) → mapear a `contact_phone` ou `contact_instagram`
3. Fallback: procurar em `bot_state` json field se alguma conversa tem esse chatId guardado

Também adicionar o campo `PLACEMENT_OPTIONS.dialogId` como alternativa ao `CHAT_ID` (o Bitrix24 passa o `dialogId` no novo formato de placement).

```typescript
// CORRETO — extrair dialogId também:
const chatId = parseInt(
  placementOptions.CHAT_ID || 
  placementOptions.ID ||
  (placementOptions.dialogId || "").replace("chat", "") ||
  body.CHAT_ID || "0"
);

// Tentar encontrar conversa via im.chat.get → members → contact_phone
const chatInfo = await callBitrix(endpoint, accessToken, "im.chat.get", {
  CHAT_ID: chatId
});
// Extrair utilizador externo do chat e mapear à conversa
```

### 3. `supabase/functions/bitrix24-install/index.ts`

Adicionar o mesmo `OPTIONS` com `iconName` ao `placement.bind` durante a instalação, para que novos portais já tenham o botão correto.

## Sequência após o deploy

1. Clicar em **"Re-registar Webhooks"** no painel Bitrix24App
2. O resultado de `placement_IM_TEXTAREA` passa de `ERROR_ARGUMENT` para `OK`
3. No chat de Open Lines do Bitrix24, aparece o ícone 🤖 na barra de ferramentas acima do campo de texto
4. Operador clica → slider abre brevemente → fecha com "Emmely AI retomou o atendimento"

## O que NÃO muda

- Schema da base de dados — sem novas colunas
- Lógica de eventos de mensagens
- UI da aplicação React
