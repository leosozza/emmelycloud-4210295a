

# Correção do Fluxo de Baixa — Deal 14091

## Problema Identificado

O fluxo de **baixa** tem duas falhas críticas:

### Falha 1: `financial_records` nunca é atualizado
Quando o utilizador clica "Confirmar Baixa", a função `submitBaixa()` chama `payment-create` PATCH com `status_update: 'confirmed'`. O PATCH handler (linha 216-256) **só atualiza a tabela `payment_transactions`** — nunca toca na tabela `financial_records`. Resultado: a parcela no `financial_records` continua com `status: 'pendente'` e `paid_at: null`, mesmo após a baixa.

Quando o tab recarrega, se os dados vêm de `financial_records` (caso do deal 14091 — importado via Access), o status ainda aparece como pendente porque `financial_records.status` não foi alterado.

### Falha 2: Smart Invoice usa stageId errado
O código client-side (linha 1151) usa `stageId: 'DT31_6:P'`, mas conforme a memória do projeto, a pipeline correcta é `DT31_3` com estágio `DT31_3:P` para "Pago".

## Plano de Correção

### 1. Atualizar `payment-create` PATCH para sincronizar `financial_records`
**Ficheiro:** `supabase/functions/payment-create/index.ts`

No handler PATCH (após atualizar `payment_transactions`):
- Se `status_update === 'confirmed'`, verificar se a transação tem `financial_record_id`
- Se sim, atualizar `financial_records` com `status: 'paga'`, `paid_at`, `payment_method`
- Se não tem `financial_record_id`, procurar em `financial_records` pelo `bitrix24_deal_id` na metadata e pelo valor/número da parcela

### 2. Corrigir stageId da Smart Invoice no Bitrix24
**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

Na função `submitBaixa()` (linha 1151):
- Mudar de `stageId: 'DT31_6:P'` para `stageId: 'DT31_3:P'`
- Adicionar `closedate` com a data de pagamento para registo correto

### Ficheiros a editar
1. `supabase/functions/payment-create/index.ts` — PATCH handler: sincronizar `financial_records`
2. `supabase/functions/bitrix24-payment-tab/index.ts` — `submitBaixa()`: corrigir stageId da fatura

