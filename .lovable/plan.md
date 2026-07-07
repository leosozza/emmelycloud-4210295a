## Problema

O robot `emmely_send_whatsapp` foi disparado no deal 47047 mas não apareceu comentário na timeline (nem sucesso nem falha).

## Causa raiz

Nos logs do edge function, o Bitrix envia `document_id` como **objeto indexado**:

```json
"document_id": {"0":"crm","1":"CCrmDocumentDeal","2":"DEAL_47047"}
```

No `bitrix24-robot-handler/index.ts` (linha 2427-2436) o parsing só trata array:

```ts
const docStr = Array.isArray(docId) ? String(docId[2] || "") : String(docId || "");
```

Como `docId` é um objeto (não array), cai no `else` e vira `"[object Object]"`. Nenhum regex bate, `tlEntity` fica `null`, `timelineCtx` fica `undefined`, e `handleSendWhatsApp` não posta nada na timeline.

(O `emmely_create_charge` posta na timeline porque usa `properties.deal_id` diretamente, não `document_id` — por isso funcionou para o mesmo deal 47047.)

## Correção

**Arquivo:** `supabase/functions/bitrix24-robot-handler/index.ts` (bloco linhas 2427-2436)

Substituir a extração de `docStr` por um helper que aceita:
- array: `docId[2]`
- objeto indexado: `docId["2"]` ou `docId[2]`
- string direta: `docId`

```ts
const extractDocStr = (d: any): string => {
  if (!d) return "";
  if (Array.isArray(d)) return String(d[2] || d[1] || "");
  if (typeof d === "object") return String(d["2"] ?? d[2] ?? d["1"] ?? "");
  return String(d);
};
const docStr = extractDocStr(docId);
```

Nada mais muda — os regex `DEAL_\d+`, `LEAD_\d+`, `DYNAMIC_\d+_\d+` continuam iguais, e o `timelineCtx` passa a ser construído corretamente para deals, leads e SPAs.

## Fora de escopo

- Não altero `handleSendWhatsApp`, `postTimelineComment`, nem a lógica de envio ao `message-send`.
- Não mexo em outros robots (charge, proposal, etc.) — cada um já resolve a entidade pelo próprio caminho.

## Validação

Após deploy, disparar novamente o robot Emmely WhatsApp no deal 47047 e confirmar:
1. Aparece comentário na timeline com `[B]✅ WhatsApp enviado[/B]` ou `[B]❌ WhatsApp NÃO enviado[/B]`.
2. `bitrix24_debug_logs` mostra `event_type = 'timeline_comment_add'` associado ao robot.
