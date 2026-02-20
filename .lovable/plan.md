
# Botão "Devolver ao Bot" no Chat do Bitrix24

## O que o utilizador quer

Na janela de bate-papo do Bitrix24 (Open Lines/Contact Center), quando um operador humano está a atender a conversa, deve aparecer um botão/item de menu que permita devolver o controlo ao bot Emmely AI com um clique.

## Como funciona na documentação oficial do Bitrix24

### Placement `IM_TEXTAREA`

O Bitrix24 permite registar widgets **acima do campo de texto** do chat via `placement.bind` com `PLACEMENT: "IM_TEXTAREA"`. Este é o local correto para adicionar botões de ação no contexto de um chat.

Quando o utilizador clica no item, o Bitrix24 abre um **slider com o URL do handler**, passando via POST:
- `PLACEMENT_OPTIONS`: JSON com o `CHAT_ID`
- `AUTH_ID`: token OAuth do utilizador que clicou
- `member_id`: identifica o portal

### Como "devolver ao bot" funciona tecnicamente

Não existe um método `imbot.session.bot` direto, mas a sequência correta baseada na documentação é:

1. O handler recebe o `CHAT_ID` do chat da Open Line
2. Chamar `imopenlines.bot.session.operator` — NÃO, este transfere para humano
3. A abordagem correta: usar `imbot.chat.add` NÃO, o bot já está no chat
4. **Abordagem real**: Atualizar `attendance_mode = 'bot'` na nossa tabela `conversations` para esse CHAT_ID + enviar uma mensagem do bot via `imbot.message.add` a indicar que o bot retomou

Na prática, "devolver ao bot" no nosso sistema significa:
- Encontrar a `conversation` pela `bitrix_chat_id`
- Atualizar `attendance_mode = 'bot'`
- Limpar `bot_state` (reset para o início)
- Enviar mensagem via `imbot.message.add` a informar o cliente que o assistente virtual retomou

## Ficheiros a criar/editar

### 1. `supabase/functions/bitrix24-install/index.ts`

Adicionar o registo do widget `IM_TEXTAREA` durante a instalação:

```typescript
// Após o registo do connector e do bot:
await callBitrix(clientEndpoint, accessToken, "placement.bind", {
  PLACEMENT: "IM_TEXTAREA",
  HANDLER: `${supabaseUrl}/functions/v1/bitrix24-return-to-bot`,
  TITLE: "🤖 Devolver ao Bot",
  LANG_ALL: {
    pt: { TITLE: "🤖 Devolver ao Bot" },
    en: { TITLE: "🤖 Return to Bot" },
    ru: { TITLE: "🤖 Вернуть боту" },
  }
});
```

### 2. Nova Edge Function: `supabase/functions/bitrix24-return-to-bot/index.ts`

Handler do widget. Quando o operador clica em "Devolver ao Bot":

1. Recebe o POST do Bitrix24 com `PLACEMENT_OPTIONS` (contém `CHAT_ID`)
2. Extrai `member_id` para encontrar a integração
3. Valida o token OAuth
4. Procura a `conversation` pela `bitrix_chat_id`
5. Atualiza `attendance_mode = 'bot'` e limpa `bot_state`
6. Chama `imbot.message.add` para enviar mensagem no chat do Bitrix24 a informar que o bot retomou
7. Retorna HTML com `BX24.closeApplication()` para fechar o slider imediatamente

```typescript
// Lógica principal:
const chatId = parseInt(placementOptions.CHAT_ID || placementOptions.ID || "0");

// Encontrar conversa
const { data: conversation } = await supabase
  .from("conversations")
  .select("id, attendance_mode")
  .eq("bitrix_chat_id", chatId)
  .maybeSingle();

if (conversation) {
  // Devolver ao bot
  await supabase.from("conversations").update({
    attendance_mode: "bot",
    bot_state: {},
  }).eq("id", conversation.id);
  
  // Notificar no chat do Bitrix24
  const botId = integration.config?.bot_id;
  if (botId) {
    await callBitrix(endpoint, token, "imbot.message.add", {
      BOT_ID: botId,
      DIALOG_ID: chatId,
      MESSAGE: "✅ O assistente virtual Emmely AI retomou o atendimento.",
    });
  }
}

// Fechar o slider imediatamente
return html(`<script>BX24.init(function(){ BX24.closeApplication(); });</script>`);
```

### 3. `supabase/functions/bitrix24-rebind-events/index.ts`

Adicionar o re-bind do `IM_TEXTAREA` placement quando o utilizador clica em "Re-registar Webhooks" no painel, para garantir que o widget é registado mesmo em portais já instalados.

## Fluxo completo

```text
1. Operador humano está a atender conversa na Open Line
2. Operador clica no ícone "🤖 Devolver ao Bot" no painel acima do campo de texto
3. Bitrix24 abre slider → chama bitrix24-return-to-bot com CHAT_ID
4. Edge function:
   a. Encontra a conversation pela bitrix_chat_id
   b. Atualiza attendance_mode = 'bot'
   c. Envia mensagem do bot no chat
   d. Fecha o slider (BX24.closeApplication())
5. Próxima mensagem do cliente → bot responde automaticamente
```

## Nota importante sobre re-instalação

O `placement.bind` só regista o widget em portais novos (durante a instalação). Para portais já instalados, é necessário clicar em "Re-registar Webhooks" no painel do Bitrix24App, que chamará `bitrix24-rebind-events` — que também deve registar o placement.

## Ficheiros a alterar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/bitrix24-return-to-bot/index.ts` | CRIAR — handler do widget |
| `supabase/functions/bitrix24-install/index.ts` | EDITAR — registar `placement.bind IM_TEXTAREA` |
| `supabase/functions/bitrix24-rebind-events/index.ts` | EDITAR — re-bind do placement |

## O que NÃO muda

- Schema da base de dados — não são necessárias novas colunas
- Edge functions de mensagens, workers, etc.
- A UI da nossa aplicação React — o botão existe DENTRO do Bitrix24 como widget nativo
