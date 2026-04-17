

## Diagnóstico

Erro: `Could not find the 'currency' column of 'financial_records' in the schema cache`

A função `payment-create-link` (no bloco que materializa parcelas sintéticas) tenta inserir:
- `currency` → **coluna não existe** na tabela
- `contract_id` → **NOT NULL** mas não é fornecido

Resultado: qualquer pagamento gerado a partir de uma parcela sintética (negócio Bitrix24 sem `financial_records` local) falha.

## Plano

1. **Corrigir o INSERT em `payment-create-link/index.ts`**
   - Remover o campo `currency` do `insert` (não existe na tabela). A moeda continua a ser usada apenas para o Stripe e gravada nos `metadata` da `payment_transactions`.
   - Tornar `contract_id` opcional ao tornar a coluna nullable na BD (migração), já que parcelas sintéticas vindas só de `bitrix24_deal_id` não têm contrato local.
   - Alternativa considerada: criar um contrato “fantasma” — rejeitada por poluir a BD.

2. **Migração SQL**
   - `ALTER TABLE public.financial_records ALTER COLUMN contract_id DROP NOT NULL;`
   - Garante que parcelas vindas exclusivamente do Bitrix24 (sem proposta/contrato local) podem ser materializadas.

3. **Tratamento de erro mais resiliente no frontend (`PagamentoPublico.tsx`)**
   - Quando a API devolver erro de materialização ou faltarem campos do Bitrix24 (ex.: sem `OPPORTUNITY`, sem `UF_CRM_EMMELY_INSTALLMENT_VALUE`), abrir um **modal explicativo** em vez de toast vermelho cru.
   - O modal lista o que falta e oferece duas ações:
     - “Tentar novamente”
     - “Copiar detalhes para suporte”
   - Mantém o botão “Pagar” desativado até o problema ser resolvido.

4. **Validação prévia no backend**
   - Em `payment-create-link`, antes de tentar inserir, validar que existe pelo menos: valor da parcela (`installment_value > 0`) e moeda. Se faltar, devolver `400` com `{ error, missing_fields: [...] }` estruturado para o frontend conseguir renderizar o modal.

5. **Redeploy**
   - `payment-create-link` após as correções.

## Detalhes técnicos

- Campos válidos em `financial_records` (confirmado por `\d`): `id, contract_id, description, total_value, payment_method, installment_number, total_installments, installment_value, status, due_date, paid_at, receipt_url, stripe_payment_id, created_at, updated_at, bitrix24_deal_id, bitrix24_invoice_id, proposal_id`. Não existe `currency` — é gerida apenas no Stripe / `payment_transactions`.
- A migração para tornar `contract_id` nullable é segura (não há FK quebrada, apenas relaxa NOT NULL).
- Resposta de erro estruturada do backend:
  ```json
  { "error": "Faltam dados para gerar a cobrança", "missing_fields": ["installment_value"] }
  ```
- O modal no frontend usa o `Dialog` já existente em `@/components/ui/dialog`.

## Resultado esperado

- Cliente consegue gerar o link de pagamento mesmo sem contrato local.
- Quando algum campo essencial do Bitrix24 estiver em falta, o utilizador vê um modal claro a indicar exatamente o que falta — sem erros 500 nem toasts crípticos.

