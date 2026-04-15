

## Problema
O botão "Enviar" no placement CRM não funciona por dois bugs no JavaScript inline:

1. **Campo errado**: O CRM tab envia `{ message: "..." }` mas a edge function `message-send` espera `{ content: "..." }` — o campo `message` é ignorado e nada é enviado.

2. **Sem conversation_id**: Quando não há conversa existente, o código tenta chamar `message-send` sem `conversation_id`, mas essa função retorna erro 400 (`conversation_id required`). Não há lógica para criar conversa nova.

## Solução

### Ficheiro: `supabase/functions/bitrix24-crm-tab/index.ts`

**Fix 1 — Campo `content` (linha ~741)**
Alterar de:
```javascript
body: JSON.stringify({
  conversation_id: CONVERSATION_ID,
  message: message,
  direction: 'outbound',
  sender_name: 'Operador'
})
```
Para:
```javascript
body: JSON.stringify({
  conversation_id: CONVERSATION_ID,
  content: message
})
```

**Fix 2 — Criar conversa quando não existe (linhas ~767-794)**
Quando `CONVERSATION_ID` é nulo mas temos `PHONES`, criar primeiro a conversa na tabela `conversations` via uma chamada directa ao Supabase REST API (`POST /rest/v1/conversations`), depois usar o `conversation_id` retornado para chamar `message-send` normalmente.

Alternativamente, usar `bitrix24-send` (que já aceita envio sem conversa prévia via connector) como fallback quando não há `CONVERSATION_ID`.

## Resultado esperado
- Com conversa existente: mensagem é enviada correctamente via `content`
- Sem conversa: cria a conversa no banco e depois envia a mensagem

