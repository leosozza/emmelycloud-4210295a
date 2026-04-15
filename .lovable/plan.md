

## Problema

1. **Mensagens do placement não identificam o agente** — `message-send` grava sempre `sender_name: "Atendente"` e o `bitrix24-crm-tab` não passa o nome do operador/agente
2. **Mensagens do placement não aparecem no bate-papo Bitrix24** — o placement envia via `message-send` (que vai directo ao WhatsApp/Instagram), mas não chama `bitrix24-send` para espelhar no Open Channel
3. **Não há modo silencioso** — análises e instruções de IA enviadas ao Bitrix24 aparecem para o cliente, quando deviam ficar apenas registadas internamente

## API Bitrix24 a utilizar

| Método | Finalidade |
|---|---|
| `imconnector.chat.name.set` | Definir o nome do chat com o nome do agente activo |
| `imopenlines.session.mode.silent` | Activar modo silencioso para mensagens internas de IA |
| `imopenlines.crm.message.add` | Enviar mensagem no chat do Open Channel vinculado ao CRM (alternativa ao `imconnector.send.messages` para mensagens do placement) |
| `imopenlines.dialog.get` | Obter o `CHAT_ID` do diálogo para usar nos métodos acima |

## Plano de implementação

### 1. Aceitar `sender_name` no `message-send`

Na Edge Function `message-send`, aceitar um parâmetro opcional `sender_name` no body. Se fornecido, usar esse valor em vez do fixo `"Atendente"` ao gravar na tabela `messages`.

### 2. Passar o nome do operador no CRM tab (placement)

No `bitrix24-crm-tab`, ao chamar `message-send`, incluir o nome do utilizador Bitrix24 actual (já disponível via `BX24.callMethod("user.current")`) como `sender_name`. O HTML já tem acesso ao utilizador — basta passar o campo.

### 3. Espelhar mensagens do placement no Bitrix24 Open Channel

Após o envio bem-sucedido via `message-send`, o `bitrix24-crm-tab` deve também chamar `bitrix24-send` (fire-and-forget) para que a mensagem apareça no bate-papo do Bitrix24. Incluir o nome do operador no corpo da mensagem (ex: `[b]Nome[/b] - texto`).

### 4. Modo silencioso para mensagens de IA

No `bitrix24-send`, aceitar um parâmetro `silent: true`. Quando activo:
- Chamar `imopenlines.dialog.get` para obter o `CHAT_ID` do diálogo
- Chamar `imopenlines.session.mode.silent` com `ACTIVATE: "Y"`
- Enviar a mensagem via `imconnector.send.messages`
- Desactivar o modo silencioso (`ACTIVATE: "N"`)

No `ai-process-message`, ao enviar análises/instruções internas para o Bitrix24, passar `silent: true`.

### 5. Definir nome do chat com o agente activo

No `bitrix24-send`, após envio bem-sucedido, se um `agentName` for fornecido no body, chamar `imconnector.chat.name.set` para actualizar o nome do chat com o nome do agente (ex: "Emmely AI - Dra. Ana").

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/message-send/index.ts` | Aceitar `sender_name` no body, usar em vez de `"Atendente"` |
| `supabase/functions/bitrix24-crm-tab/index.ts` | Passar nome do operador + chamar `bitrix24-send` após envio |
| `supabase/functions/bitrix24-send/index.ts` | Suporte a `silent`, `agentName`, `imconnector.chat.name.set` |
| `supabase/functions/ai-process-message/index.ts` | Passar `silent: true` para instruções internas de IA |

### Resultado esperado
- Mensagens do placement mostram o nome do operador na conversa
- Mensagens do placement aparecem no bate-papo do Bitrix24
- Análises e instruções de IA ficam registadas mas não são enviadas ao cliente
- Nome do chat no Bitrix24 reflecte o agente activo

