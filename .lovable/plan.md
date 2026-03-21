

# Correção: Parcelas desaparecem após baixa

## Problema

Quando se faz a baixa de uma parcela legada (importada do Access), o sistema cria uma `payment_transaction` sintética. Na recarga seguinte, o código muda de caminho:
- **Antes:** sem transações → busca `financial_records` por `bitrix24_deal_id` → mostra todas as 6 parcelas
- **Depois:** 2 transações existem (para parcela 4) → ignora `financial_records` → mostra apenas as 2 transações → restantes parcelas desaparecem

## Solução

Alterar a lógica do DEAL VIEW no `bitrix24-payment-tab` para **sempre verificar** `financial_records` pelo `bitrix24_deal_id`, independentemente de existirem transações. Quando ambas as fontes existirem, usar `financial_records` como base e enriquecer com dados das transações correspondentes.

### Ficheiro: `supabase/functions/bitrix24-payment-tab/index.ts`

**Mudança na lógica de carregamento (linhas ~1757-1790):**

1. Mover a query de `financial_records` por `bitrix24_deal_id` para ANTES da decisão de qual caminho seguir
2. Se existirem `financial_records` directos (com `bitrix24_deal_id`), usá-los SEMPRE como fonte primária — mesmo que também existam transações
3. Cruzar com `dealTransactions` para enriquecer com `transaction_id`, `payment_url`, etc.

```text
Hoje:
  if (financialRecords from contract_ids) → use them
  else if (dealTransactions) → use only transactions  ← BUG: perde parcelas
  else if (no txs) → fallback financial_records by deal_id
  else → synthetic

Depois:
  ALWAYS check financial_records by bitrix24_deal_id
  if (directFinRecords exist) → use as base, match with transactions
  else if (financialRecords from contract_ids) → use them
  else if (dealTransactions) → use transactions
  else → synthetic
```

Isto garante que, para dados importados do Access, as 6 parcelas são sempre mostradas, independentemente de quantas transações sintéticas existam.

