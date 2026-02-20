
# Fix: IA só responde "Desculpe, não consegui processar a sua mensagem"

## Causa Raiz Identificada (confirmada por logs)

O `bitrix24-worker` chama o `ai-process-message` com `conversation_id: null` intencionalmente (quer apenas a resposta da IA sem gravar na base de dados), mas o `ai-process-message` exige `conversation_id` obrigatoriamente e rejeita com **HTTP 400**.

O worker então cai no fallback `aiResult.reply || "Desculpe, não consegui processar a sua mensagem."` — que é precisamente o que o utilizador vê no Bitrix24.

**Pipeline com erro:**
```
Utilizador envia mensagem no Bitrix24 IM Bot
→ bitrix24-worker.handleBotMessage()
→ POST ai-process-message { conversation_id: null, message_text: "...", skip_send: true }
→ ai-process-message retorna 400 (conversation_id required)
→ worker usa fallback: "Desculpe, não consegui processar a sua mensagem."
→ imbot.message.add com o fallback ← utilizador vê isto
```

## Solução: 2 mudanças simples

### Mudança 1 — `ai-process-message` aceitar modo "sem conversa"

Tornar `conversation_id` opcional quando `skip_send: true`. Se não houver `conversation_id`, salta todas as verificações de conversa (attendance_mode, channel settings) e chama a IA diretamente:

```typescript
// ANTES (linha 30):
if (!conversation_id || !message_text) return 400

// DEPOIS:
if (!message_text) return 400
// Se skip_send=true e conversation_id=null, vai direto à IA
```

Quando `conversation_id` é nulo com `skip_send: true`:
- Não verifica attendance_mode
- Não verifica chatbot_channel_settings
- Vai direto ao agente e chama a IA
- Devolve `{ reply: "..." }` normalmente

### Mudança 2 — `bitrix24-worker` também usa `ai-playground` como alternativa

Como o `ai-process-message` é mais complexo, uma alternativa mais simples: o worker pode chamar diretamente o `ai-playground` (que já aceita sem `conversation_id`) em vez de `ai-process-message` para respostas do IM Bot.

O `ai-playground` já aceita apenas `{ agent_id, messages }` e devolve `{ content: "..." }`. É exatamente o que o worker precisa para o bot IM.

## Ficheiros a Alterar

### `supabase/functions/ai-process-message/index.ts`
- Tornar `conversation_id` opcional
- Se `conversation_id` for null/ausente E `skip_send=true`: saltar verificações de conversa, ir direto à IA com o `agent_id` fornecido

### `supabase/functions/bitrix24-worker/index.ts`
- Na função `handleBotMessage`: mudar de `ai-process-message` para `ai-playground`
- Ajustar o parsing da resposta: `aiResult.reply` → `aiResult.content`
- Passar o histórico de mensagens correto para manter contexto da conversa

## Impacto

- Sem alterações à base de dados
- O bot IM do Bitrix24 volta a responder corretamente com IA real
- As mensagens do Instagram/WhatsApp não são afetadas (continuam a usar `ai-process-message` com `conversation_id` real)
- A mensagem de boas-vindas também fica correta (já usa `handleWelcome` separado)
