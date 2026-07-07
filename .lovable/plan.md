# Correções WhatsApp: CTA URL no Gupshup + timeline Bitrix24 dos envios

## 1) Botão CTA URL foi entregue como JSON (texto cru)

**Causa.** O endpoint público do Gupshup (`/wa/api/v1/msg`) não suporta `type: "cta_url"` no parâmetro `message`. Quando envia um tipo desconhecido, o Gupshup faz relay como texto — foi por isso que o cliente recebeu o JSON literal `{"type":"cta_url",...}`.

Só a Meta Cloud API tem `interactive.cta_url` nativo. No Gupshup, botão com URL só funciona via **template HSM aprovado** com botão URL dinâmico.

**Correção.**
- **`gupshup-send/index.ts`** — remover o case `cta_url` do `buildMessageObject`. Continua no schema, mas cai no default text.
- **`message-send/index.ts`, ramo Gupshup** — quando `message_type === "cta_url"`, montar texto com preview de link em vez de tentar interactive:
  ```
  gsBody.message_type = "text";
  gsBody.content = [content, label, url].filter(Boolean).join("\n");
  ```
  (mantém o rótulo visível e o WhatsApp gera preview clicável.)
- **Meta Cloud API** — mantém `interactive.cta_url` (funciona nativamente).
- **WUZAPI** — já usa fallback de texto (mantém).
- **Aviso na resposta** ao utilizador: para link de pagamento por robot no Gupshup, o caminho correto para botão real é criar um template HSM com botão URL dinâmico e usar `message_type = template` (o URL vira parâmetro do botão CTA do template).

## 2) Timeline Bitrix24 dos envios de mensagem

Hoje só os pagamentos aparecem na timeline. Envio, entrega, leitura e erro de WhatsApp não aparecem. Vamos replicar o mesmo padrão dos badges de pagamento.

**Estratégia — 1 comentário por mensagem, atualizado in-place** (evita spam):
- Ao enviar: cria comentário na timeline com estado inicial "📤 Enviada" e guarda o `COMMENT_ID` retornado em `messages.bitrix_timeline_comment_id`.
- Ao chegar `delivered` / `read` / `failed`: chama `crm.timeline.comment.update` para reescrever o texto ("✅ Entregue às hh:mm" / "👁 Lida às hh:mm" / "❌ Falha: <motivo>"). Sem criar novos itens.
- Fallback se `comment.update` falhar: adiciona um segundo comentário curto.

**Novos artefactos.**

### 2.1 Migration
Adicionar coluna:
```sql
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS bitrix_timeline_comment_id BIGINT,
  ADD COLUMN IF NOT EXISTS bitrix_entity_ref TEXT; -- ex: "deal:45807" ou "contact:1234"
CREATE INDEX IF NOT EXISTS idx_messages_bitrix_comment ON public.messages(bitrix_timeline_comment_id);
```

### 2.2 Nova edge function `bitrix24-post-message-timeline`
Input: `{ message_id, event: "sent" | "delivered" | "read" | "failed", error?: string }`.
Fluxo:
1. Carrega `messages` (`id`, `conversation_id`, `content`, `media_type`, `bitrix_timeline_comment_id`, `bitrix_entity_ref`, `external_id`, `sender_name`).
2. Se `bitrix_entity_ref` vazio: resolve via `conversations.bot_state.bitrix_entity_id` / `bitrix_deal_id`. Se ainda vazio, chama `crm.duplicate.findbycomm` (TYPE=PHONE) para achar deal ou contact e persiste em `messages.bitrix_entity_ref` + `conversations.bot_state`.
3. Formata texto compacto:
   - `sent`: "📤 WhatsApp enviado — «preview de até 120 chars»"
   - `delivered`: "✅ Entregue às HH:mm"
   - `read`: "👁 Lido às HH:mm"
   - `failed`: "❌ Falha: <error>"
4. Se `bitrix_timeline_comment_id` existe → `crm.timeline.comment.update`. Caso contrário → `crm.timeline.comment.add` e guarda o ID.
5. Usa a mesma integração/token do `bitrix24-robot-handler` (reutiliza `callBitrixWithRefresh`).

### 2.3 Pontos de disparo
- **`message-send/index.ts`** — depois de gravar a mensagem com sucesso e canal WhatsApp, chamar fire-and-forget `bitrix24-post-message-timeline` com `event: "sent"`. Já receberia `bitrix_entity_id` quando presente no body; caso contrário resolve depois.
- **`gupshup-webhook/index.ts`** — no bloco `message-event` que já mapeia `enqueued/sent/delivered/read/failed`, disparar a mesma função com o `event` correspondente após o `UPDATE messages`.
- **`whatsapp-webhook/index.ts`** (Meta) — no handler de `statuses[]`, mesmo disparo.
- **`wuzapi-webhook/index.ts`** — quando processar `ReadReceipt`/`ack`, mesmo disparo.

### 2.4 Deploy
Migration + deploy de:
- `bitrix24-post-message-timeline` (nova)
- `gupshup-send`
- `message-send`
- `gupshup-webhook`
- `whatsapp-webhook`
- `wuzapi-webhook`

## Fora de escopo
- UI do chat já mostra ticks de status (`MessageBubble`); nada a mudar aí.
- Não vamos criar activity separada por mensagem — só um comentário compacto por envio.
- Templates HSM com botão URL: fica como recomendação; a criação do template é manual pelo cliente na aprovação Meta/Gupshup.
