
# Problema Diagnosticado: IM Bot vs Conector - Dois Sistemas Distintos

## O que o utilizador tem razão em apontar

O Bitrix24 tem **duas funcionalidades completamente independentes**:

### Sistema 1: IM Bot (Chatbot nativo)
- Registado via `imbot.register` com `TYPE: "B"`
- Aparece nos **Contactos do utilizador no Bitrix24** (secção de Mensagens/Chat)
- Responde a eventos `ONIMBOTMESSAGEADD` e `ONIMBOTWELCOMEMESSAGE`
- Para responder, usa `imbot.message.add` com o parâmetro **`BOT_ID`** obrigatório
- É **completamente independente** do WhatsApp/Instagram
- Problema actual: o worker tenta `im.message.add` em vez de `imbot.message.add`

### Sistema 2: Conector (Canal externo no Contact Center)
- Registado via `imconnector.register`
- Aparece no **Contact Center** para receber mensagens de WhatsApp/Instagram
- Requer activação manual em cada Open Line
- Usa `ONIMCONNECTORMESSAGEADD` para eventos

## Problemas Encontrados na Análise

### Problema 1: Worker usa método errado para responder ao bot
O `handleBotMessage` no worker chama:
```
im.message.add { DIALOG_ID: dialogId, MESSAGE: text }
```
Devia chamar:
```
imbot.message.add { BOT_ID: 10245, DIALOG_ID: dialogId, MESSAGE: text }
```
Sem `BOT_ID`, a mensagem não é associada ao bot e **não aparece** no chat.

### Problema 2: Bot ID não está no integration correctamente
O `bitrix_agent_id` é `null` na base de dados. O `bot_id` está guardado dentro do campo `config` como JSON (config->>'bot_id' = '10245'), mas o worker procura em `integration.bitrix_agent_id` (campo da tabela) em vez de `integration.config->>'bot_id'`.

### Problema 3: EVENT_WELCOME_MESSAGE_ERROR no registo
Os logs mostram que numa instalação anterior houve `EVENT_WELCOME_MESSAGE_ERROR`. O URL do handler precisa de ser acessível publicamente e aceitar o POST do Bitrix24.

### Problema 4: bitrix_agent_id em vez de usar config.bot_id
O worker procura:
```typescript
if (integration.bitrix_agent_id) { ... }
```
Mas o bot_id está em `integration.config.bot_id`, não em `integration.bitrix_agent_id`.

### Problema 5: Payload ONIMBOTMESSAGEADD mal estruturado
O Bitrix24 envia o evento com esta estrutura:
```json
{
  "event": "ONIMBOTMESSAGEADD",
  "data": {
    "PARAMS": {
      "BOT_ID": "10245",
      "DIALOG_ID": "chat123",
      "MESSAGE": "Olá",
      "FROM_USER_ID": "5"
    }
  }
}
```
O worker actual acede como `msgData.PARAMS` mas o payload guardado na queue é a estrutura completa incluindo o campo `data` como subchave.

## Solução: 3 Ficheiros a Corrigir

### Correcção 1: `bitrix24-worker/index.ts` - Função `handleBotMessage`

Mudar de `im.message.add` para `imbot.message.add` com `BOT_ID`:

```typescript
// ERRADO (actual):
await callBitrix(integration.client_endpoint, accessToken, "im.message.add", {
  DIALOG_ID: dialogId || chatId,
  MESSAGE: replyText,
});

// CORRECTO (a implementar):
const botId = integration.config?.bot_id || integration.bitrix_agent_id;
await callBitrix(integration.client_endpoint, accessToken, "imbot.message.add", {
  BOT_ID: botId,           // ← OBRIGATÓRIO para o bot responder
  DIALOG_ID: dialogId,
  MESSAGE: replyText,
});
```

Também corrigir a extracção do `dialogId` do payload, que está aninhado dentro de `data.PARAMS`:

```typescript
// O payload guardado na queue tem esta estrutura:
// { event: "ONIMBOTMESSAGEADD", data: { PARAMS: { DIALOG_ID: "...", MESSAGE: "..." } }, auth: {...} }
const msgData = payload.data || {};
const params = msgData.PARAMS || {};
const dialogId = params.DIALOG_ID || params.dialog_id || "";
const messageText = params.MESSAGE || params.message || "";
```

### Correcção 2: `bitrix24-worker/index.ts` - Função `handleWelcome`

Idem para a welcome message, usar `imbot.message.add`:

```typescript
const botId = integration.config?.bot_id;
await callBitrix(integration.client_endpoint, accessToken, "imbot.message.add", {
  BOT_ID: botId,
  DIALOG_ID: dialogId,
  MESSAGE: welcomeText,
});
```

### Correcção 3: `bitrix24-install/index.ts` - Registo do Bot

Adicionar verificação de erro `EVENT_WELCOME_MESSAGE_ERROR` e tentar registo sem `EVENT_WELCOME_MESSAGE` como fallback. Também guardar o `bot_id` directamente na coluna `bitrix_agent_id` da tabela para facilitar acesso:

```typescript
await supabase
  .from("bitrix24_integrations")
  .update({
    bitrix_agent_id: botId,   // ← guardar na coluna directa
    config: {
      ...existingConfig,
      bot_id: botId,
    },
  })
  .eq("id", integrationId);
```

### Correcção 4: `bitrix24-events/index.ts` - Adicionar `ONIMBOTWELCOMEMESSAGE`

O evento de boas-vindas do bot é `ONIMBOTWELCOMEMESSAGE` mas não está na lista de eventos suportados:

```typescript
const SUPPORTED_EVENTS = [
  "ONIMCONNECTORMESSAGEADD",
  "ONIMBOTMESSAGEADD",
  "ONIMBOTJOINOPEN",
  "ONIMBOTWELCOMEMESSAGE",   // ← já existe, OK
  "ONIMCONNECTORSTATUSDELETE",
];
```

## Ficheiros a Editar

1. `supabase/functions/bitrix24-worker/index.ts` - Corrigir método de resposta do bot (`imbot.message.add` + `BOT_ID`) e extracção correcta do payload
2. `supabase/functions/bitrix24-install/index.ts` - Guardar `bot_id` também em `bitrix_agent_id` (coluna directa) e melhorar tratamento de erros no registo
3. Deploy das funções editadas
4. Após deploy, reinstalar a aplicação no Bitrix24 para criar um bot fresco com ID correcto

## O que NÃO precisa de ser mudado

- `bitrix24-events/index.ts` está correcto - faz ACK rápido e enfileira
- `bitrix24-connector-settings/index.ts` está correcto para o conector
- A arquitectura da fila (`bitrix_event_queue`) está correcta

## Resumo do Fluxo Correcto Após Fix

```text
Utilizador escreve no chat do Bitrix24 ao bot "Emmely AI"
        ↓
Bitrix24 dispara ONIMBOTMESSAGEADD
        ↓
bitrix24-events: enfileira em bitrix_event_queue + retorna "successfully"
        ↓
bitrix24-worker: processa ONIMBOTMESSAGEADD
  - Extrai: params.DIALOG_ID, params.MESSAGE, params.BOT_ID
  - Chama ai-process-message para gerar resposta IA
  - Chama imbot.message.add com BOT_ID=10245 e DIALOG_ID
        ↓
Resposta aparece no chat do Bitrix24 como mensagem do bot "Emmely AI"
```
