

## Plan: Fix Smart Invoice Deal Field + Test Deal 8857 with "Direto"

### Analysis
The Bitrix24 HTML confirms the deal binding field is `PARENT_ID_2` (shown as "Negócio" in the Smart Invoice form). The current code already sends `parentId2` which is correct. The `ufCrm31Deal` field added previously is likely being ignored or causing issues — it's not a standard field for Smart Process type 31.

The key issue: in `crm.item.add` REST API for Smart Processes, field names use **camelCase** format. The deal binding is `parentId2` (parent entity of type 2 = Deal). There is no separate `ufCrm31Deal` field — that was a mistaken assumption. The `parentId2` field alone should handle the deal link correctly.

### Changes

1. **Remove `ufCrm31Deal`** from the `crm.item.add` call — it's not a real field and may cause warnings. Keep only `parentId2` which is confirmed correct from the HTML.

2. **Test with deal 8857** using `bodyOverrides`:
   - `force_gateway: "direto"` — crediário próprio, no external payment gateway
   - 3 parcels: €200 each (01/02, 03/03, 02/04)
   - Parcela 1 should be marked `confirmed` after creation
   - Verify Smart Invoices appear in `/crm/type/31/` kanban with deal and contact linked

### File changed
- `supabase/functions/bitrix24-payment-webhook/index.ts` — remove `ufCrm31Deal` line (line 308)

### Test
After deploy, call the webhook with:
```json
{
  "deal_id": 8857,
  "bodyOverrides": {
    "force_gateway": "direto",
    "total_amount": 600,
    "num_installments": 3,
    "first_due_date": "2025-02-01",
    "interval_days": 30
  }
}
```

