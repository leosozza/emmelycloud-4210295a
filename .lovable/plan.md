

## Problem

The `bitrix24-reports` edge function has two bugs preventing correct client name resolution:

1. **Proposals query missing `case_id`** (line 59): Without `case_id`, the chain `proposal -> case -> lead -> client_id -> clients.name` never executes.
2. **Payment transactions query missing `client_id`** (line 68): Without `client_id`, the direct `payment -> clients.name` lookup never works.

Both paths fail silently, falling back to `proposal.client_name` which stores old/incorrect names.

## Fix

In `supabase/functions/bitrix24-reports/index.ts`:

1. **Line 59**: Change proposals select from `"id, client_name, title, created_by"` to `"id, client_name, title, created_by, case_id"`
2. **Line 68**: Change payment_transactions select from `"id, financial_record_id, gateway, payment_method, company_id, created_at, metadata"` to `"id, financial_record_id, gateway, payment_method, company_id, client_id, created_at, metadata"`

Then redeploy the edge function. No other code changes needed.

