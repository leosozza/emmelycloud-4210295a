

## Plan: Fix Smart Invoice Deal & Contact Binding + Test with Deal 8857

### Problem
The `crm.item.add` call in `bitrix24-payment-webhook` uses `parentId2` and `contactId`, but Smart Invoices (entityTypeId 31) in Bitrix24 require the explicit field `UF_CRM_SMART_INVOICE_DEAL` to properly link to a deal in the kanban view. The `contactId` field may also need to be passed as `ufCrm3_contactId` or via the `contacts` binding depending on the Bitrix24 version.

### Fix in `supabase/functions/bitrix24-payment-webhook/index.ts`

Update the `fields` object in the `crm.item.add` call (around line 302) to include:

```typescript
fields: {
  title: invoiceTitle,
  opportunity: parcel.amount,
  currencyId: currency,
  isManualOpportunity: "Y",
  parentId2: parseInt(String(dealId)),
  ufCrm31Deal: parseInt(String(dealId)),       // UF_CRM_SMART_INVOICE_DEAL equivalent
  contactId: contactId ? parseInt(String(contactId)) : undefined,
  begindate: new Date().toISOString().split("T")[0],
  closedate: parcel.due_date,
  comments: `Fatura gerada automaticamente pelo Emmely Pay. ${label}. Grupo: ${groupId}`,
}
```

Note: The REST API field name for `UF_CRM_SMART_INVOICE_DEAL` in `crm.item.add` for Smart Process type 31 is typically `parentId2` (parent deal). If the Bitrix24 instance has a custom field `UF_CRM_SMART_INVOICE_DEAL`, we add it explicitly. We keep both `parentId2` and the UF field for maximum compatibility.

### Testing
After deploying, call the webhook with `deal_id: 8857` to create 3 new invoices and verify they appear linked in the Bitrix24 kanban at `/crm/type/31/`.

### Files changed
- `supabase/functions/bitrix24-payment-webhook/index.ts` — add `ufCrm31Deal` field to `crm.item.add`

