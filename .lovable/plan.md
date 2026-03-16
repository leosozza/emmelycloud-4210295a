

## Plano: Adicionar `bitrix24_deal_id` e `bitrix24_invoice_id` à tabela `financial_records`

### Contexto
Cada `financial_record` (parcela) pode estar vinculada a um Deal e a uma Smart Invoice (Type 31) no Bitrix24. Quando se dá baixa num pagamento, é necessário atualizar tanto o registo local como a fatura no Bitrix24. Dois IDs separados são necessários para este rastreamento bidirecional.

### Alterações

**1. Migração SQL — 2 novas colunas**
```sql
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS bitrix24_deal_id text;
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS bitrix24_invoice_id text;
CREATE INDEX IF NOT EXISTS idx_fr_bitrix24_deal_id ON public.financial_records(bitrix24_deal_id) WHERE bitrix24_deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fr_bitrix24_invoice_id ON public.financial_records(bitrix24_invoice_id) WHERE bitrix24_invoice_id IS NOT NULL;
```

**2. Backend `import-access-data/index.ts`**
- Na Fase 3, após criar/encontrar o Deal, guardar o `dealId` no `financial_record`:
  ```typescript
  await supabase.from("financial_records").update({ bitrix24_deal_id: String(dealId) }).eq("id", fr.id);
  ```
- Após criar/encontrar a Invoice (Type 31), guardar o `invoiceId`:
  ```typescript
  await supabase.from("financial_records").update({ bitrix24_invoice_id: String(invoiceId) }).eq("id", fr.id);
  ```

**3. Backend `bitrix24-payment-webhook` / reconciliação de baixa**
- Ao dar baixa numa parcela, usar o `bitrix24_invoice_id` para actualizar o stage da fatura para "Convertido/Pago" no Bitrix24 via `crm.item.update`.
- Usar o `bitrix24_deal_id` para actualizar campos UF do Deal (parcelas pagas, etc.).

### Ficheiros alterados
- Migração SQL (2 colunas + índices)
- `supabase/functions/import-access-data/index.ts` (guardar ambos os IDs)

