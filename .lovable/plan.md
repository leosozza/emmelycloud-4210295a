

## Plano: Configurações de Taxas de Juros Pós-Atraso no Emmely Pay

### O que será feito

Adicionar uma secção de **Configurações de Encargos por Atraso** na tab Pagamentos (Integrações), onde o utilizador define:
- **Multa fixa** (% única sobre a parcela) — padrão: 10%
- **Juros mensais** (% proporcional ao dia) — padrão: 1%/mês
- **Limite máximo de dias** para cálculo de juros — padrão: 365 dias
- **Dias de tolerância** (grace period antes de aplicar encargos) — padrão: 0

A lógica de cálculo segue o modelo profissional:
```text
diasAtraso = max(0, dataPagamento - dataVencimento - diasTolerancia)
multa      = parcela × (multaPct / 100)        [cobrada 1x]
juros      = parcela × (jurosPct / 100) × (min(diasAtraso, limiteMax) / 30)
valorFinal = parcela + multa + juros
```

### Alterações

**1. Tabela `payment_gateway_config`** — Inserir registro `late_fees` com as taxas padrão via `config` JSON:
```json
{
  "penalty_pct": 10,
  "interest_monthly_pct": 1,
  "max_interest_days": 365,
  "grace_days": 0
}
```
Usar a tabela existente `payment_gateway_config` (que já tem campo `config jsonb`), inserindo um registro com `gateway = 'late_fees'`.

**2. UI — `src/pages/Integracoes.tsx`** — Adicionar na `PagamentosTab`, após os 3 cards de gateway e antes do card de transações recentes, um card "Encargos por Atraso" com:
- 4 inputs numéricos (multa %, juros %/mês, limite dias, tolerância dias)
- Simulador em tempo real: o utilizador insere valor da parcela e dias de atraso → mostra multa, juros e valor final calculados
- Botão "Guardar" que faz upsert na `payment_gateway_config`

**3. Lógica de cálculo reutilizável** — Criar `src/lib/lateFeeCalc.ts` com função pura `calculateLateFees(amount, daysLate, config)` que retorna `{ penalty, interest, charges, total }`, para ser usada tanto no frontend (simulador) como importada por edge functions.

### Ficheiros

| Ficheiro | Acção |
|----------|-------|
| `src/lib/lateFeeCalc.ts` | **Criar** — função de cálculo |
| `src/pages/Integracoes.tsx` | **Editar** — adicionar card de configuração + simulador na PagamentosTab |
| SQL (insert) | **Executar** — inserir registro padrão em `payment_gateway_config` |

