
Diagnóstico confirmado:

- A parcela `4` do deal `14091` existe em `financial_records` com ID `c257de59-d47b-46c5-9d38-7fc3dc7c4439`, status `atrasada` e `bitrix24_invoice_id = 6069`.
- Continua sem qualquer linha em `payment_transactions` ligada por `financial_record_id`.
- O erro atual (`Transaction c257de59... not found in payment_transactions`) mostra que o fluxo ainda está a chegar ao backend com o UUID da parcela como se fosse `transaction_id`.

Isto indica que a correção anterior melhorou o erro silencioso, mas ainda falta tornar o fluxo resistente a dados legados/cache do placement.

Plano de correção:

1. Endurecer `ensureTxExists()` no `bitrix24-payment-tab`
- Não confiar apenas em “txId não vazio”.
- Se `transaction_id`:
  - estiver vazio, ou
  - for igual ao `financial_record_id`, ou
  - não existir de facto em `payment_transactions`,
  então criar/obter uma transação real vinculada ao `financial_record_id`.
- Continuar a incluir nos metadados:
  - `bitrix_deal_id`
  - `installment_number`
  - `total_installments`
  - `bitrix_invoice_id`

2. Corrigir o submit da baixa para trabalhar com IDs separados
- Garantir que o modal envia sempre:
  - `transaction_id` real
  - `financial_record_id`
  - `invoice_id`
- Nunca reutilizar `financial_record_id` como `transaction_id`, mesmo em fallback.

3. Tornar o `payment-create` PATCH tolerante a placements antigos
- Se `transaction_id` não existir mas `financial_record_id` vier no body:
  - procurar transação existente por `financial_record_id`
  - se não existir, criar uma transação sintética “direto” já ligada à parcela
  - depois aplicar o `status_update`
- Assim, mesmo que o iframe esteja com HTML antigo/cacheado, a baixa continua a funcionar.

4. Manter a sincronização completa da baixa
- Após confirmar:
  - atualizar `payment_transactions`
  - sincronizar `financial_records` para `paga`
  - preencher `paid_at`
  - manter `payment_method` e comprovativo, se existirem
  - atualizar a Smart Invoice `6069` para `DT31_3:P` com `closedate`

5. Rever mensagens e logs
- Melhorar resposta de erro para distinguir:
  - “ID recebido é de financial_record, não de transaction”
  - “transação criada automaticamente para registo legado”
- Adicionar logs curtos para rastrear:
  - `transaction_id` recebido
  - `financial_record_id`
  - se houve fallback/criação sintética

Ficheiros a ajustar:
- `supabase/functions/bitrix24-payment-tab/index.ts`
- `supabase/functions/payment-create/index.ts`

Resultado esperado:
- A baixa da parcela 4 do deal 14091 deixa de falhar mesmo com dados legados
- A parcela passa para `paga`
- `paid_at` é preenchido
- A Smart Invoice `6069` também é marcada como paga

Detalhe técnico principal:
```text
Hoje:
placement envia/aceita UUID da parcela como transaction_id
→ PATCH procura em payment_transactions
→ não encontra
→ erro

Depois:
placement valida transaction_id real
ou backend faz fallback por financial_record_id
→ cria/resolve payment_transaction correta
→ confirma baixa
→ sincroniza financial_records
→ baixa também a Smart Invoice
```
