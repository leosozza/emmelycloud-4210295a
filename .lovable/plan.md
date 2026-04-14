

# Fix: Multiple payment links generated + link not saved to Bitrix24 field

## Problem
When clicking "Link" on a payment installment in the Emmely Pay placement:
1. Every click creates a **new** Stripe checkout session and a new `payment_transactions` row (no idempotency)
2. The button doesn't disable during the request, so rapid clicks create duplicates
3. The generated `payment_url` is never written back to the Bitrix24 deal field `UF_CRM_EMMELY_RECEIPT_URL`

## Root Cause
The `generatePaymentLink()` JS function (line 1086) sends a bare POST to `payment-create` without `financial_record_id` or `transaction_id`. It also doesn't check if a transaction already exists for that installment.

## Changes

### File: `supabase/functions/bitrix24-payment-tab/index.ts`

**1. Fix `generatePaymentLink` (line ~1086)**
- Pass `financial_record_id` and existing `transaction_id` from the installment data
- If a `transaction_id` already exists and has a `payment_url`, skip creation and just show/copy the existing link
- Disable the button during the request to prevent double-clicks
- After successful link generation, update Bitrix24 field `UF_CRM_EMMELY_RECEIPT_URL` via `BX24.callMethod('crm.deal.update', ...)`

**2. Add dedup logic**
```
// Before calling payment-create:
// If inst.transaction_id exists and inst.payment_url exists → just copy and show
// If inst.transaction_id exists but no payment_url → call payment-create with transaction_id to generate link for existing tx
// If no transaction_id → call ensureTxExists first, then generate link
```

**3. Write payment URL back to Bitrix24**
After getting the `payment_url` from the response, call:
```javascript
BX24.callMethod('crm.deal.update', {
  id: ENTITY_ID,
  fields: { UF_CRM_EMMELY_RECEIPT_URL: data.transaction.payment_url }
});
```

### Redeploy
- Redeploy `bitrix24-payment-tab`

