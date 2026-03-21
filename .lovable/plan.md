
Problema confirmado: a baixa da parcela 4 do deal 14091 continua sem efeito porque o placement está a enviar o ID errado para o backend.

O que encontrei:
- A parcela 4 em `financial_records` existe e continua como `status = atrasada`, `paid_at = null`, com `bitrix24_invoice_id = 6069`.
- Não existe nenhuma `payment_transaction` ligada a essa parcela (`financial_record_id = c257de59-d47b-46c5-9d38-7fc3dc7c4439`).
- No `bitrix24-payment-tab`, quando a UI monta parcelas vindas de `financial_records`, ela envia:
  - `id: rec.id`
  - `transaction_id: matchingTx?.id`
- Como não há transação para esse registo legado, `transaction_id` fica vazio.
- Ao abrir o modal de baixa, o código faz:
  - `document.getElementById('baixa-tx-id').value = inst.transaction_id || inst.id`
- Ou seja: para registos legados, está a usar o `financial_records.id` como se fosse `payment_transactions.id`.
- Depois o `PATCH /payment-create` recebe esse UUID em `transaction_id`, mas tenta atualizar `payment_transactions`, não encontra linha nenhuma e acaba a responder `ok` sem realmente sincronizar a parcela.

Prova prática:
- Testei manualmente o `payment-create` com `transaction_id = c257de59-d47b-46c5-9d38-7fc3dc7c4439` e a função devolveu `ok`, mas a parcela continuou inalterada.
- Isso mostra que o problema não é só o stage da fatura: o fluxo de baixa está a apontar para a tabela errada nos casos importados/legados.

Plano de correção:
1. Corrigir o `bitrix24-payment-tab` para distinguir claramente:
   - `financial_record_id`
   - `transaction_id`
   - `invoice_id`
2. No modal de baixa, quando não existir transação real:
   - criar uma `payment_transaction` sintética já vinculada ao `financial_record_id`
   - incluir nos metadados `bitrix24_deal_id`, `installment_number` e `bitrix_invoice_id`
3. Ajustar `ensureTxExists()` para aceitar e enviar `financial_record_id` e `installment_number`, em vez de criar transação solta apenas com `bitrix_deal_id`
4. Tornar o `payment-create` PATCH mais seguro:
   - se o `update` não encontrar transação, devolver erro explícito em vez de `ok`
   - opcionalmente aceitar fallback por `financial_record_id` para registos legados
5. Manter a atualização da Smart Invoice após a baixa, usando a fatura correta (`6069` neste caso)

Ficheiros a ajustar:
- `supabase/functions/bitrix24-payment-tab/index.ts`
- `supabase/functions/payment-create/index.ts`

Resultado esperado após a correção:
- Parcela 4 do deal 14091 passa para `paga`
- `paid_at` é preenchido
- a Smart Invoice 6069 também é marcada como paga
- o placement deixa de falhar silenciosamente para parcelas importadas do Access

Detalhe técnico principal:
```text
Hoje:
financial_record -> UI usa rec.id como transaction_id -> PATCH payment_create procura em payment_transactions -> não encontra -> nada muda

Depois:
financial_record -> UI envia financial_record_id
             -> ensureTxExists cria payment_transaction real ligada à parcela
             -> PATCH payment_create atualiza a transação certa
             -> sync em financial_records
             -> update da Smart Invoice
```
