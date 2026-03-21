

# Juros de Atraso no EmmeyPay — Cálculo + Exibição + Baixa

## Problemas Identificados

1. **Juros nunca são calculados nem exibidos** — O `bitrix24-payment-tab` não calcula late fees para parcelas atrasadas. A listagem mostra apenas o `value` original, sem multa nem juros.
2. **Modal de baixa ignora juros** — O `openBaixaModal` define `_baixaOriginalAmount = inst.value` (valor base), sem somar encargos. O campo "Valor da Parcela" mostra só o valor original.
3. **Diferença não é somada à próxima parcela** — Se o utilizador dá baixa com valor inferior ao total com juros, a diferença deveria ser adicionada à próxima parcela pendente. Isto não existe.

## Plano de Correção

### 1. Adicionar cálculo de late fees no servidor (`bitrix24-payment-tab`)

**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

- Buscar configuração de `payment_gateway_config` onde `gateway = 'late_fees'` e `is_active = true`
- Copiar a função `calculateLateFees()` para dentro do edge function (como já feito em `payment-reminder`)
- Para cada parcela com `status === 'atrasada'`, calcular dias de atraso e aplicar multa + juros
- Adicionar campos à `InstallmentData`: `late_penalty`, `late_interest`, `late_total` (valor base + encargos)

### 2. Exibir juros na listagem de parcelas

Na renderização de cada parcela atrasada, mostrar:
```text
Parcela: €150.00
⚠️ Multa: €15.00 | Juros (45 dias): €2.25
💵 Total com encargos: €167.25
```

### 3. Modal de baixa com juros

- `openBaixaModal`: se parcela atrasada, calcular juros e mostrar breakdown:
  - Valor base da parcela
  - Multa (%)
  - Juros (% × dias)
  - **Total com encargos** ← valor pré-preenchido no campo "Valor Efetivamente Pago"
- Adicionar secção visual de breakdown no modal (entre "Valor da Parcela" e "Valor Efetivamente Pago")

### 4. Carry-over: diferença somada à próxima parcela

No `payment-create` PATCH:
- Se `paid_amount < valor_com_juros` e não há `discount_reason`:
  - Calcular `remainder = total_com_juros - paid_amount`
  - Encontrar a próxima parcela pendente (mesmo `contract_id` ou `bitrix24_deal_id`, `installment_number` seguinte)
  - Somar `remainder` ao `installment_value` dessa parcela
  - Registar nos metadata: `{ carried_from: parcela_id, carried_amount: X }`
- Se há `discount_reason`, tratar como desconto (comportamento atual mantido)

### 5. Exibir carry-over na listagem

Se uma parcela tem `metadata.carried_amount > 0`, mostrar:
```text
+€17.25 juros acumulados da parcela anterior
```

## Ficheiros a editar

1. **`supabase/functions/bitrix24-payment-tab/index.ts`** — cálculo de juros, exibição na listagem, modal de baixa com breakdown
2. **`supabase/functions/payment-create/index.ts`** — carry-over da diferença para próxima parcela

