

# Criar Campos de Comprovante no Bitrix24 (Link + PDF)

## Objetivo

Adicionar dois novos campos personalizados no Bitrix24 para que o link do comprovante e o PDF fiquem visíveis diretamente no Deal/Lead:
- **UF_CRM_EMMELY_RECEIPT_URL** — Link público do comprovante (tipo `url`)
- **UF_CRM_EMMELY_RECEIPT_PDF** — Link do PDF do comprovante (tipo `url`)

## Implementação

### Ficheiro 1: `supabase/functions/bitrix24-install/index.ts`

Adicionar 2 novos campos ao array `emmelyUserFields` (nas duas ocorrências — repair_fields e install):

```typescript
{
  FIELD_NAME: "UF_CRM_EMMELY_RECEIPT_URL",
  USER_TYPE_ID: "url",
  SORT: 120,
  EDIT_FORM_LABEL: { br: "Comprovante (Link)", en: "Receipt Link" },
  LIST_COLUMN_LABEL: { br: "Comprovante", en: "Receipt" },
  LIST_FILTER_LABEL: { br: "Comprovante", en: "Receipt" },
},
{
  FIELD_NAME: "UF_CRM_EMMELY_RECEIPT_PDF",
  USER_TYPE_ID: "url",
  SORT: 130,
  EDIT_FORM_LABEL: { br: "Comprovante (PDF)", en: "Receipt PDF" },
  LIST_COLUMN_LABEL: { br: "PDF Comprovante", en: "Receipt PDF" },
  LIST_FILTER_LABEL: { br: "PDF Comprovante", en: "Receipt PDF" },
}
```

Adicionar ao `fieldMappings` seed:
```typescript
{ bitrix_field_key: "UF_CRM_EMMELY_RECEIPT_URL", bitrix_field_title: "Comprovante (Link)", supabase_table: "receipt_links", supabase_column: "public_url" },
{ bitrix_field_key: "UF_CRM_EMMELY_RECEIPT_PDF", bitrix_field_title: "Comprovante (PDF)", supabase_table: "receipt_links", supabase_column: "pdf_url" },
```

### Ficheiro 2: `supabase/functions/bitrix24-update-deal-payment/index.ts`

Adicionar suporte para os novos campos no `payment_data`:
```typescript
if (payment_data?.receipt_url) ufFields["UF_CRM_EMMELY_RECEIPT_URL"] = payment_data.receipt_url;
if (payment_data?.receipt_pdf) ufFields["UF_CRM_EMMELY_RECEIPT_PDF"] = payment_data.receipt_pdf;
```

### Ficheiro 3: `supabase/functions/bitrix24-payment-tab/index.ts`

Após criar/encontrar o `receipt_link` na baixa manual, calcular os URLs e incluí-los no payload enviado ao `bitrix24-update-deal-payment`:
```typescript
receipt_url: `${SUPABASE_URL}/functions/v1/payment-receipt?token=${token}`,
receipt_pdf: pdfUrl  // se existir
```

### Ficheiro 4: `supabase/functions/payment-create/index.ts`

Após criar o `receipt_link` na baixa automática, chamar `bitrix24-update-deal-payment` com os campos `receipt_url` e `receipt_pdf` para atualizar o Deal no Bitrix24.

### Ficheiro 5: `supabase/functions/bitrix24-rebind-events/index.ts`

Adicionar os 2 novos campos ao array de `emmelyUserFields` (se existir lá uma cópia para re-registro).

## Ficheiros a editar

1. **`supabase/functions/bitrix24-install/index.ts`** — adicionar campos UF_CRM_EMMELY_RECEIPT_URL e UF_CRM_EMMELY_RECEIPT_PDF + field mappings
2. **`supabase/functions/bitrix24-update-deal-payment/index.ts`** — suportar receipt_url e receipt_pdf no payload
3. **`supabase/functions/bitrix24-payment-tab/index.ts`** — enviar URLs do comprovante ao atualizar o deal
4. **`supabase/functions/payment-create/index.ts`** — enviar URLs do comprovante ao deal após baixa automática

