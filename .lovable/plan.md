## Objetivo
Adicionar botão "Gerar todas as cobranças" no cabeçalho do Emmely Pay (iframe Bitrix) para criar em lote os checkouts Stripe/Asaas de todas as parcelas ainda "Não geradas".

## Mudanças

### `supabase/functions/bitrix24-payment-tab/index.ts`
1. **UI (cabeçalho do plano)** — junto ao botão "Editar", adicionar:
   - `Gerar todas as cobranças (N)` — só aparece quando existe ≥1 parcela sintética/pendente sem `gateway_payment_id`.
2. **Handler `generateAllCharges()`**:
   - Coleta todas as parcelas com badge "Não gerada" (as sintéticas + pendentes sem checkout real).
   - Executa sequencialmente (evita rate-limit Stripe) chamando o mesmo fluxo do botão individual "Gerar cobrança" (payment-create-link por parcela, com `financial_record_id`, `installment_number`, `bitrix_deal_id` no metadata).
   - Mostra progresso (`Gerando 2/6…`) e toast final com sucessos/erros.
   - Se todas OK: `BX24.reloadWindow()` para refletir badges "Gerada" + links.
3. **Confirmação**: `confirm("Gerar N cobranças reais no Stripe/Asaas? Cada parcela receberá um link de pagamento.")` antes de disparar.

## Fora de escopo
- Não altera lógica de webhook nem de reconciliação (já corrigidas turno passado).
- Não altera edição individual/full.
