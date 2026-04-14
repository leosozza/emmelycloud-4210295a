

# Fix: `payment_transactions_gateway_check` constraint violation

## Root Cause

In `payment-create/index.ts` line 648, the `effectiveGateway` value stored in the database is computed as:
```
normalizedGateway || gateway
```

When the robot sends `force_gateway: "auto"` (or any value not in the `gwMap`), `normalizedGateway` keeps that original value (e.g. `"auto"`). The DB constraint only allows: `stripe`, `asaas`, `direto`, `stripe_pt`, `stripe_br`.

Similarly, `payment_method` values like `"multibanco"`, `"mb_way"`, `"sepa_debit"` would violate the `payment_method` constraint (allowed: `card`, `pix`, `boleto`, `transfer`, `parcelado_direto`).

## Plan

### 1. Fix `payment-create/index.ts` — normalize `effectiveGateway`

**Line ~535**: After the `gwMap` lookup, add `"auto"` to the map (→ `null`) so it doesn't persist as-is. Also, if the value after mapping is still not one of the 5 valid DB values, reset `normalizedGateway` to `null` so it falls through to `gateway`.

**Line ~648**: Change `effectiveGateway` logic to always resolve to a valid DB value:
```typescript
const validGateways = ["stripe", "asaas", "direto", "stripe_pt", "stripe_br"];
const effectiveGateway = (payment_method === "direto" || normalizedGateway === "direto") 
  ? "direto" 
  : (normalizedGateway && validGateways.includes(normalizedGateway) ? normalizedGateway : (stripeRegion ? `stripe_${stripeRegion}` : gateway));
```

**Line ~661**: Normalize `payment_method` to valid DB values — map `multibanco`, `mb_way`, `sepa_debit` → `card` for the stored record.

### 2. Optionally expand DB constraint

Add a migration to extend the `payment_transactions_gateway_check` to include `"multibanco"` etc., or keep normalizing to valid values (preferred — simpler).

### 3. Redeploy `payment-create`

### File changes

| File | Change |
|---|---|
| `supabase/functions/payment-create/index.ts` | Fix `effectiveGateway` and `payment_method` normalization before DB insert |

