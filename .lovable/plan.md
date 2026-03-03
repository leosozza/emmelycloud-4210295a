

## Plano: Criar Faturas no Bitrix24 para o Deal 8901

### Diagnóstico
As 3 parcelas foram criadas chamando `payment-create` directamente, que apenas cria transações locais no Supabase. A criação de faturas no Bitrix24 só acontece em dois fluxos:
- **`bitrix24-robot-handler`** → usa `crm.invoice.add` (API legacy)
- **`bitrix24-payment-webhook`** → usa `crm.item.add` com `entityTypeId: 31` (Smart Process)

O kanban `/crm/type/31/` usa Smart Process, logo precisamos de `crm.item.add`.

### Abordagem
Apagar as 3 transações de teste e re-executar via **`bitrix24-payment-webhook`** (que cria transações + Smart Invoices tipo 31 de uma só vez). Este endpoint já tem toda a lógica de:
1. Buscar o deal no Bitrix24
2. Calcular parcelas
3. Criar transações via `payment-create`
4. Criar Smart Invoices via `crm.item.add` entityTypeId 31
5. Linkar os IDs das faturas nas transações

### Passos

1. **Limpar transações existentes** — DELETE das 3 transações do deal 8901
2. **Chamar `bitrix24-payment-webhook`** com `deal_id: 8901` — isto cria 3 parcelas + 3 Smart Invoices no Bitrix24
3. **Ajustar status** — Parcela 1 → `confirmed`, Parcela 2 → vencimento passado, Parcela 3 → vencimento futuro
4. **Verificar** — Confirmar no kanban `/crm/type/31/` que as faturas aparecem

### Nota técnica
O `bitrix24-payment-webhook` usa os campos configurados no `config` da integração (como `deal_amount_field`, `deal_installments_field`). Se esses campos não estiverem mapeados, usa os defaults (`OPPORTUNITY`, 1 parcela). Pode ser necessário passar parâmetros extra no body ou garantir que o deal 8901 tem `OPPORTUNITY = 1000` e os campos de parcelas preenchidos no Bitrix24.

