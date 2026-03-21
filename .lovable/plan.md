

# Correção: Juros de Atraso Não Calculados + Comprovante Sem Pendência

## Problemas Raiz

### 1. Status nunca muda para "atrasada"
A tabela `financial_records` mantém `status = 'pendente'` mesmo quando `due_date` já passou. O cálculo de juros no `bitrix24-payment-tab` (linha 2079) verifica `inst.status === "atrasada"` — como o status nunca é atualizado, os juros nunca são calculados.

**Evidência**: Deal 14091, parcela 4 — `due_date: 2026-02-10`, `status: paga`, `installment_value: 120.00` (sem juros). Parcela 5 — `due_date: 2026-03-10`, `status: pendente` (deveria ser `atrasada`).

### 2. Comprovante não mostra juros de parcelas pagas nem pendências
O `payment-receipt` só calcula juros para parcelas `isOverdue && !isPaid`. Uma vez paga, a parcela mostra apenas o valor original. Não há registo dos juros cobrados.

## Correções

### Ficheiro 1: `supabase/functions/bitrix24-payment-tab/index.ts`

**Linha 2079** — Expandir a condição para incluir parcelas pendentes com `due_date` passada:
```
if ((inst.status === "atrasada" || (inst.status === "pendente" && inst.due_date)) && inst.due_date) {
  const dueDate = new Date(inst.due_date + "T00:00:00Z");
  const diffMs = now.getTime() - dueDate.getTime();
  const daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (daysLate > 0) {
    inst.status = "atrasada";  // Auto-corrigir status visual
    // ... cálculo existente
  }
}
```

Mesma correção na secção Contact View (~linha 1820-1832) onde os `directFinRecords` são mapeados sem cálculo de late fees.

### Ficheiro 2: `supabase/functions/payment-receipt/index.ts`

**Mostrar juros para parcelas pagas com atraso**: Se `isPaid && paid_at > due_date`, calcular os juros que foram (ou deveriam ter sido) cobrados e mostrar na coluna "Juros/Multa".

**Mostrar juros para parcelas pendentes em atraso**: Já funciona se `isOverdue`, mas a condição `isOverdue` falha porque o status é `pendente` e não `atrasada`. Corrigir para verificar `due_date < now` independente do status.

**Adicionar linha de totais**: Somar juros pendentes ao "Em Aberto" para o cliente ver o valor real em dívida.

### Ficheiro 3: `supabase/functions/payment-create/index.ts`

Na secção de baixa (PATCH), guardar os juros cobrados nos metadata do `financial_records`:
- Ao atualizar o `financial_records` para `paga`, incluir os late fee metadata (`late_fee_charged`) no update para que o comprovante possa exibi-los posteriormente.

## Ficheiros a editar

1. **`supabase/functions/bitrix24-payment-tab/index.ts`** — auto-detectar atraso por `due_date` (não depender apenas de `status`)
2. **`supabase/functions/payment-receipt/index.ts`** — mostrar juros de parcelas pagas com atraso + corrigir detecção de overdue
3. **`supabase/functions/payment-create/index.ts`** — persistir late fee metadata no financial_record ao dar baixa

