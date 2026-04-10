

# Fix: PIX not showing in Stripe Checkout for Brasil

## Problem
The `createStripePayment` function and `bitrix24-payment-handler` both create Stripe Checkout Sessions without specifying `payment_method_types`. This relies on Stripe's "automatic payment methods" setting in the dashboard. For the BR account, PIX may not be enabled there, or Stripe doesn't auto-detect it.

The function `getStripePaymentMethods` already exists and returns `["card", "boleto", "pix", "link"]` for region `"br"`, but is never called.

## Solution

### 1. `supabase/functions/payment-create/index.ts`
In `createStripePayment` (line 50), use `getStripePaymentMethods` to explicitly pass `payment_method_types` to the Checkout Session when a region is specified:

```typescript
// After line 59, add payment method types for regional accounts
const methods = getStripePaymentMethods(region, requestedMethod);
methods.forEach((m, i) => {
  params.append(`payment_method_types[${i}]`, m);
});
```

This ensures PIX, Boleto, Multibanco, MB WAY etc. appear based on region.

### 2. `supabase/functions/bitrix24-payment-handler/index.ts`
Same fix — add explicit `payment_method_types` based on the resolved gateway region. When `stripe_br` is selected, include `["card", "pix", "boleto", "link"]`.

### Files
1. `supabase/functions/payment-create/index.ts` — wire `getStripePaymentMethods` into `createStripePayment`
2. `supabase/functions/bitrix24-payment-handler/index.ts` — add payment method types for regional Stripe

