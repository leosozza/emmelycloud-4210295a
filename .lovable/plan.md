

## Plano: Corrigir Lógica de Faturas na Sincronização (Fase 3)

### Problema identificado

Na criação de faturas (Smart Invoices Type 31), o título atual é apenas `Parcela X/Y - SERVIÇO`, sem o nome do cliente. O utilizador espera que a fatura contenha:
1. **Nome do cliente** (da tabela `clients`)
2. **Produto/Serviço** (da `description` do financial_record — ex: "NACIONALIDADE PORTUGUESA")
3. **Valor da parcela** (installment_value)

Além disso, o stage da fatura paga deve reflectir "Convertido" (paga) com base na `paid_at`.

### Alterações no `supabase/functions/import-access-data/index.ts`

**A. Título da fatura — incluir nome do cliente e produto**
- Formato actual: `Parcela 1/3 - NACIONALIDADE PORTUGUESA`
- Formato corrigido: `Parcela 1/3 - NACIONALIDADE PORTUGUESA - João Silva`

Linha 881:
```typescript
// DE:
const invoiceTitle = `Parcela ${fr.installment_number}/${fr.total_installments} - ${desc}`;
// PARA:
const invoiceTitle = `Parcela ${fr.installment_number}/${fr.total_installments} - ${desc} - ${clientName}`;
```

**B. Adicionar produto como line item na fatura (Product Row)**
- Usar `crm.item.productrow.set` para adicionar uma linha de produto à fatura com:
  - `PRODUCT_NAME`: nome do serviço (desc)
  - `PRICE`: valor da parcela
  - `QUANTITY`: 1

**C. Garantir que o contactId está sempre vinculado**
- Já está a ser feito (linha 889) — OK.

**D. Stage da fatura — manter lógica actual (já correcta)**
- `DT31_6:P` = paga (com `closedate` = `paid_at`)
- `DT31_6:NEW` = pendente
- `DT31_6:UC` = atrasada
- Isto já está implementado correctamente.

**E. Filtro de busca de faturas existentes — incluir nome do cliente**
- Actualizar o filtro `%title` na linha 898 para incluir o novo formato com nome do cliente, garantindo que o dedup não cria duplicadas.

### Ficheiro alterado
- `supabase/functions/import-access-data/index.ts` (secção de invoices, linhas ~866-911)

### Resultado esperado
```text
Fatura no Bitrix24:
  Título: "Parcela 1/3 - NACIONALIDADE PORTUGUESA - João Silva"
  Produto: NACIONALIDADE PORTUGUESA (€150.00 x 1)
  Contacto: João Silva (vinculado)
  Deal pai: vinculado via parentId2
  Stage: Convertido (se paga) / Novo (se pendente) / Em atraso
```

