

## Plano: Usar coluna DATA dos honorários como data de criação/fecho

### Problema

A coluna `DATA` da tabela `TBL_HONORARIOS` contém a data em que o contrato/serviço foi fechado. Actualmente o código ignora este campo, e todos os registos ficam com `created_at = now()` (data de hoje).

### Correcção em `import-access-data/index.ts`

Usar `parseDate(installments[0]?.DATA)` como data de referência do grupo (serviço) e aplicá-la a:

1. **Lead** → `created_at` (data do serviço)
2. **Case** → `created_at`
3. **Proposal** → `created_at`
4. **Contract** → `created_at` e `signed_at` (se todos pagos)
5. **Financial Records** → `created_at`

A lógica será:
```typescript
const serviceDate = parseDate(installments[0]?.DATA) || new Date().toISOString();
```

E incluir `created_at: serviceDate` em cada insert (lead, case, proposal, contract, financial_record).

### Ficheiro a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/import-access-data/index.ts` | Extrair `DATA` do grupo e passar como `created_at` em todos os inserts da cadeia |

