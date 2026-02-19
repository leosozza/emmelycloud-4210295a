
# Fix: Chatbot Emmely AI não aparece no Contact Center

## Diagnóstico Completo

A análise da documentação oficial do Bitrix24 e dos logs do sistema revela a cadeia exata de falhas:

### Estado atual confirmado
- Bot `Emmely AI` registado com ID `10279`, `TYPE: "H"`, `OPENLINE: "Y"` — correto
- `bitrix_event_queue` está vazia — nenhum evento chegou do Bitrix24
- `bitrix24-events` sem logs — Bitrix24 não está a enviar eventos para os handlers
- Conector `emmely_connector` registado mas `connector_active: false`

### Problemas identificados pela documentação oficial

**Problema 1 — Evento `ONIMBOTJOINCHAT` em falta no registo do bot**

A documentação oficial mostra que para hybrid mode (bot que funciona em Open Lines), o `imbot.register` precisa do evento `EVENT_JOIN_CHAT`, não apenas `EVENT_MESSAGE_ADD`. O worker trata `ONIMBOTJOINOPEN` mas o bot não está registado para receber esse evento.

**Problema 2 — `imconnector.send.status.delivery` com estrutura errada**

A documentação oficial mostra a estrutura correta do ACK de entrega:
```php
'MESSAGES' => [
    [
        'im' => $arMessage['im'],       // objeto im do payload original
        'message' => ['id' => [$idMess]],
        'chat' => ['id' => $arMessage['chat']['id']],
    ]
]
```
O código atual envia apenas `[{ im_id: messageId, date: ... }]` — estrutura incorreta que pode causar falha silenciosa no Bitrix24.

**Problema 3 — Parser PHP aninhado não reconstrói arrays com índices numéricos corretamente**

O Bitrix24 envia `data[MESSAGES][0][message][text]` e `data[MESSAGES][0][im][id]`. O parser atual usa `{}` para todos os níveis, tornando o array `MESSAGES` num objeto `{0: {...}}`. O worker já lida com isso via `Object.values()`, mas o campo `im` (necessário para o ACK) fica dentro de `msg.im` como objeto, não como o formato que o worker espera.

**Problema 4 — Evento `ONIMBOTJOINCHAT` vs `ONIMBOTJOINOPEN`**

A documentação mostra que o evento correto para bots adicionados a Open Lines é `OnImbotJoinChat` (com `CHAT_ENTITY_TYPE: "LINES"` no payload), não `OnImbotJoinOpen`. O `bitrix24-rebind-events` pode estar a registar o nome errado.

## Solução

### 1. Re-registar o Bot com todos os eventos corretos

Atualizar o `bitrix24-install` para incluir `EVENT_JOIN_CHAT` no registo do bot:

```typescript
await callBitrix(clientEndpoint, accessToken, "imbot.register", {
  CODE: "emmely_ai_bot",
  TYPE: "H",
  EVENT_MESSAGE_ADD: eventsUrl,
  EVENT_WELCOME_MESSAGE: eventsUrl,
  EVENT_JOIN_CHAT: eventsUrl,      // NOVO — obrigatório para Open Lines
  EVENT_BOT_DELETE: eventsUrl,
  PROPERTIES: {
    NAME: "Emmely AI",
    WORK_POSITION: "Assistente Virtual IA",
    COLOR: "#25D366",
    OPENLINE: "Y",
  },
});
```

### 2. Adicionar `OnImbotJoinChat` ao bind de eventos

No `bitrix24-install` e `bitrix24-rebind-events`, adicionar `OnImbotJoinChat` à lista de eventos:

```typescript
const events = [
  "OnImConnectorMessageAdd",
  "OnImConnectorDialogStart",
  "OnImConnectorDialogFinish",
  "OnImConnectorStatusDelete",
  "OnImbotMessageAdd",
  "OnImbotWelcomeMessage",
  "OnImbotJoinOpen",
  "OnImbotJoinChat",    // NOVO — Open Lines join event
];
```

### 3. Corrigir o ACK `imconnector.send.status.delivery`

No `bitrix24-worker/handleConnectorMessage`, corrigir a estrutura do ACK conforme a documentação:

```typescript
// Estrutura correta conforme docs oficiais
const imData = msg.im || msg.IM || {};
await callBitrix(integration.client_endpoint, accessToken, "imconnector.send.status.delivery", {
  CONNECTOR: connector || CONNECTOR_ID,
  LINE: line,
  MESSAGES: [{
    im: imData,                    // objeto im original do payload
    message: { id: [messageId] }, // array de IDs
    chat: { id: chatId },          // id do chat
  }],
});
```

### 4. Melhorar o parser de PHP arrays para preservar `im` e `chat`

Ajustar o `parsePhpStyleBody` no `bitrix24-events` para reconstruir arrays numéricos como arrays JavaScript (não objetos), para que `MESSAGES[0]` seja `MESSAGES[0]` e não `MESSAGES.0`.

### 5. Adicionar suporte ao evento `ONIMBOTJOINCHAT` no worker

```typescript
case "ONIMBOTJOINCHAT":
  // Verificar se CHAT_ENTITY_TYPE === "LINES" → tratar como Open Line join
  await handleBotJoinChat(supabase, integration, event.payload);
  break;
```

### 6. Botão "Re-instalar Bot" no painel Bitrix24

Adicionar no `Bitrix24App.tsx` um botão que chama a edge function de re-instalação apenas para o bot (sem reinstalar o conector inteiro), para forçar o re-registo com os novos parâmetros sem necessitar de reinstalar a aplicação.

## Ficheiros a Alterar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Adicionar `EVENT_JOIN_CHAT` ao `imbot.register` |
| `supabase/functions/bitrix24-rebind-events/index.ts` | Adicionar `OnImbotJoinChat` ao bind de eventos |
| `supabase/functions/bitrix24-events/index.ts` | Melhorar parser PHP para arrays numéricos; adicionar `ONIMBOTJOINCHAT` à lista |
| `supabase/functions/bitrix24-worker/index.ts` | Corrigir estrutura ACK delivery; adicionar handler `ONIMBOTJOINCHAT`; extrair `im` e `chat` corretamente |
| `src/pages/Bitrix24App.tsx` | Adicionar botão "Re-registar Bot" que force-re-registers o bot com os novos parâmetros |

## Sequência de Ações após o Deploy

1. Clicar em **"Re-registar Bot"** no painel → re-regista o bot com `EVENT_JOIN_CHAT` e todos os eventos corretos
2. No Bitrix24 → Contact Center → abrir uma Open Line → Configurações → **Chatbot** → `Emmely AI` deve aparecer agora
3. Selecionar `Emmely AI` como chatbot → guardar
4. Enviar uma mensagem de teste pelo canal configurado nessa Open Line
