## Problema

O robot postou "✅ WhatsApp enviado" na timeline do deal 47047 (external_id `e07fceb5…`), mas o cliente nunca recebeu. Confirmado nos logs:

- `messages.delivery_status = failed` (gupshup-webhook `subtype: failed` em 18:29:21).
- O motivo do Gupshup NUNCA é logado (só se imprime `type/subtype`).
- A timeline continua "verde" porque o comentário postado pelo robot é imutável — não fica vinculado à `messages.bitrix_timeline_comment_id`, então o webhook posterior não o atualiza.

Ou seja: dois problemas encadeados —
1. **Silêncio de diagnóstico**: não sabemos o motivo real do Gupshup ter recusado o template `linkemmely` com o param UUID.
2. **Timeline enganosa**: mesmo quando `delivery_status` vira `failed`, o comentário do robot não reflete.

## Correção

### 1. `supabase/functions/gupshup-webhook/index.ts`
- No bloco `payload.type === "message-event"`, quando `evt.type === "failed"`, logar o **payload completo do evento** (`evt.payload`, `evt.reason`, `evt.destination`) via `console.log("[GUPSHUP-WEBHOOK] failure detail:", JSON.stringify(evt).slice(0, 800))`.
- Fica assim rastreável no Edge Functions Logs qual foi a razão real (template rejeitado, número inválido, template não aprovado, param faltando, etc.).

### 2. `supabase/functions/bitrix24-robot-handler/index.ts`
`handleSendWhatsApp` (linhas 188-365):

**a) Mudar o texto inicial** — em vez de já postar "✅ WhatsApp enviado", postar `"⏳ WhatsApp enviado ao provedor\n(aguardando confirmação de entrega)"`. Se `data.error` ou `success === false`, postar direto "❌ WhatsApp NÃO enviado — <erro>".

**b) Persistir `bitrix_timeline_comment_id` no messages** — Após o `postTimelineComment`, precisamos capturar o comment_id criado. Vou:
- Modificar `postTimelineComment` para retornar `Promise<number | null>` (ID do comentário criado no attempt 1 ou 2; `null` no fallback activity).
- No `handleSendWhatsApp`, após envio bem-sucedido: obter `savedMessageId` (retorno adicional a implementar em `message-send`) e escrever `bitrix_timeline_comment_id = <id>` na linha `messages` correspondente.

**c) `message-send` precisa retornar `saved_message_id`** — no fim do handler, mudar o payload de retorno para `{ success: true, message_id: externalMessageId, saved_message_id: savedMessageId }`. Nenhuma outra consumer quebra (todos leem apenas `message_id`).

### 3. Resultado
- `gupshup-webhook` já chama `bitrix24-post-message-timeline` com `event: "failed", error: reason` (linhas 91-102). Como o registro `messages` agora tem `bitrix_timeline_comment_id`, o comentário do robot é **atualizado in-place** para `"❌ Falha — <razão>"`, mostrando a verdade ao operador.
- Delivered/read também atualiza o mesmo comentário (já suportado pela edge `bitrix24-post-message-timeline`).

## Fora de escopo

- Não altero o template `linkemmely` nem o payload enviado ao Gupshup — o objetivo é **expor o motivo** primeiro; ajuste do template vem depois com base no log.
- Nenhuma nova coluna, nenhuma migration.
- Não mexo em `gupshup-send` nem no fluxo de outros provedores.

## Validação

1. Disparar o robot Emmely WhatsApp novamente no deal 47047.
2. Timeline deve mostrar primeiro "⏳ enviado ao provedor" e, em segundos, atualizar para "❌ Falha — <razão do Gupshup>".
3. Nos logs do `gupshup-webhook`, aparecer `[GUPSHUP-WEBHOOK] failure detail: {"type":"failed","reason":"…"}`.
4. Com a razão em mãos, decide-se se é template não aprovado, param inválido, opt-out, etc.
