

## Plan: Link Deal and Contact to Smart Invoices

### Problem
When creating Smart Invoices (entityTypeId 31) via `crm.item.add`, two bindings are missing:
1. **Deal link** — field `parentId2` is set but `UF_CRM_SMART_INVOICE_DEAL` (the standard deal binding for Smart Invoices) is not
2. **Contact link** — the contact from the deal (`CONTACT_ID`) is not linked to the Smart Invoice

### Fix
In `supabase/functions/bitrix24-payment-webhook/index.ts`, update the `fields` object in the `crm.item.add` call (lines 302-311) to include:

```typescript
fields: {
  title: invoiceTitle,
  opportunity: parcel.amount,
  currencyId: currency,
  isManualOpportunity: "Y",
  parentId2: parseInt(String(dealId)),
  contactId: contactId ? parseInt(String(contactId)) : undefined,
  begindate: new Date().toISOString().split("T")[0],
  closedate: parcel.due_date,
  comments: `Fatura gerada automaticamente pelo Emmely Pay. ${label}. Grupo: ${groupId}`,
}
```

- `contactId` — links the deal's contact to the Smart Invoice (already extracted as `deal.CONTACT_ID` on line ~215)
- `parentId2` is already present and should handle the deal binding for Smart Process type 31

### Note
The field `UF_CRM_SMART_INVOICE_DEAL` is specific to the native Smart Invoice entity. For custom Smart Processes (type 31), the deal binding is typically done via `parentId2`. If this specific Bitrix24 instance uses `UF_CRM_SMART_INVOICE_DEAL`, we add that too as a fallback.

