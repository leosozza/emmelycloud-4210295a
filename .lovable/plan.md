## Objetivo

Ao criar uma cobrança, se já existir uma transação `pending` para a mesma parcela (`financial_record_id`), reutilizar/atualizar em vez de criar duplicado — e quando a existente já tiver mais de 24h, sobrescrevê-la com uma nova sessão de gateway (link fresco).

## Comportamento actual

`supabase/functions/payment-create/index.ts` só reutiliza uma transação em dois casos:
- `existingTransactionId` explícito no body.
- `client_submit_key` idempotente nos últimos 60s.

Fora disso, faz sempre `INSERT` novo, mesmo que exista uma cobrança pendente para a mesma parcela. Isto cria duplicados e não renova links Stripe expirados (>24h).

## Alteração

Em `payment-create/index.ts`, no início do `try` principal (antes de decidir gateway), adicionar lookup por `financial_record_id`:

```text
if (!existingTransactionId && !clientSubmitKey && financial_record_id) {
  buscar payment_transactions.pending mais recente com esse financial_record_id
  se encontrada:
     idade = now - created_at
     se idade < 24h  → devolver { idempotent: true, transaction, payment_url } (sem chamar Stripe/Asaas)
     se idade >= 24h → definir existingTransactionId = tx.id (força UPDATE da linha existente com nova sessão)
}
```

Assim:
- Fresca (<24h): devolve o mesmo link, sem nova cobrança no gateway.
- Antiga (>24h): gera nova sessão Stripe/Asaas e sobrescreve `gateway_payment_id`, `payment_url`, `metadata`, mantendo o `id` — o link `/pagamento/{token}?pay=<recordId>` continua a apontar para a mesma linha e passa a ter checkout válido.

Nenhuma alteração em frontend, schema ou outros edge functions.

## Ficheiro alterado

- `supabase/functions/payment-create/index.ts` — ~15 linhas novas antes do bloco de escolha de gateway (linha ~674).
