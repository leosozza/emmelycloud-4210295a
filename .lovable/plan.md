## Objetivo

No reenvio do robot Emmely Pay para o mesmo deal Bitrix24:

- **Sem alterações** (mesmo deal + mesmas parcelas: valor, vencimento, moeda, gateway) → **reutilizar** o link e parcelas já criadas, sem gerar nada novo no Stripe/Bitrix.
- **Com alterações** (qualquer parcela mudou, ou nº de parcelas mudou) → **atualizar**: cancelar/expirar as sessões Stripe pendentes anteriores e o registo antigo, criar as novas parcelas, sobrescrever `UF_CRM_EMMELY_PAYMENT_URL`.

## Como detetar “igual vs diferente”

Assinatura determinística por deal, calculada antes de chamar `payment-create`:

```
signature = sha256(json({
  deal_id,
  currency,
  gateway,
  installments: [
    { seq, amount_cents, due_date },   // ordenadas por seq
    ...
  ]
}))
```

Guardada como `installment_signature` em cada `payment_transactions` do grupo (via `metadata.installment_signature` — sem migration).

## Fluxo em `handleCreateCharge`

1. Construir `newSignature` a partir do payload atual.
2. Query em `payment_transactions`:
   - `metadata->>bitrix_deal_id = dealId`
   - `status IN ('pending','processing')`
   - ordenar por `created_at desc`, agrupar por `installment_group_id`.
3. Se existir grupo com `metadata->>installment_signature = newSignature`:
   - **Reutilizar**: obter `payment_url` da 1ª parcela existente, reescrever `UF_CRM_EMMELY_PAYMENT_URL`/`UF_CRM_EMMELY_GATEWAY` no deal (idempotente), postar timeline `♻️ Link existente reutilizado (sem alterações)`, retornar `charge_status: "reused"`.
4. Se existir grupo `pending` com signature **diferente** (mudou algo):
   - **Cancelar** o grupo antigo: `UPDATE payment_transactions SET status='cancelled'` para todas as parcelas pending desse `installment_group_id`.
   - Best-effort `stripe.checkout.sessions.expire(session_id)` para cada uma (usar `gateway_transaction_id`); falhas apenas logadas.
   - Prosseguir com o fluxo atual de criação, gravando `metadata.installment_signature = newSignature` em cada nova parcela.
   - Timeline: `🔄 Parcelas alteradas — link anterior cancelado e novo gerado`.
5. Se não existir grupo pending → fluxo atual (criar do zero), gravando a signature.

## Alterações de código

### `supabase/functions/bitrix24-robot-handler/index.ts`
- Nova helper `computeInstallmentSignature(dealId, currency, gateway, parcels)`.
- Em `handleCreateCharge`, antes do loop de criação:
  - Query Supabase acima.
  - Branch reuse / cancel-and-recreate / create-new.
- Passar `installment_signature` no campo `metadata` do body enviado a `payment-create` (ou pós-insert update em `payment_transactions.metadata`).
- Timeline messages e `charge_status` extras (`reused`, `updated`).
- Log `bitrix24_debug_logs` com `event_type: charge_reuse_decision` (`{ decision, oldGroupId, newSignature, oldSignature }`).

### `supabase/functions/payment-create/index.ts`
- Aceitar `metadata.installment_signature` do body e persistir em `payment_transactions.metadata` no insert (se ainda não estiver).
- Best-effort helper `expireStripeSession(sessionId, secretKey)` chamado pelo robot (via nova acção `payment-cancel` ou expondo endpoint) — **alternativa mais simples**: robot chama diretamente `https://api.stripe.com/v1/checkout/sessions/{id}/expire` usando `sk_live_` obtido de `payment_gateway_config` para a região do deal. Vou usar essa via para não criar nova função.

## Não muda

- Regras de e-mail, validação, criação de faturas Bitrix, cálculo de parcelas.
- Se a única mudança for cosmética (título do deal), a signature permanece igual → reuse (correto).

## Validação

1. Reenviar deal 45807 sem mudar nada → timeline `♻️ reutilizado`, mesmo `payment_url`, **nenhuma** nova linha em `payment_transactions`.
2. Alterar valor da entrada e reenviar → timeline `🔄 alterado`, novo `payment_url`, antigas parcelas ficam `cancelled`, sessão Stripe antiga expirada, `UF_CRM_EMMELY_PAYMENT_URL` sobrescrito.
3. Alterar apenas due_date de uma parcela → mesmo comportamento do (2).
4. Sem grupo prévio → comportamento atual (criar).

## Fora de escopo

- Reaproveitar parcelas parcialmente (ex.: só mudou a 3ª). Sempre que a signature difere, recria o grupo inteiro — mais simples e evita inconsistência com faturas Bitrix.
- Recriar se grupo anterior já tem parcela `paid` → nesse caso, **abortar** com timeline `⚠️ Já existe pagamento realizado neste deal; não é possível regenerar. Cancele manualmente antes.` e `charge_status: "blocked"`.
