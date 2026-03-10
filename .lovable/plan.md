

## Problem

The Payment Tab placement has two main issues:

1. **Unprofessional icons** — Uses emoji characters (📅, 💳, 🏦, ✏, 🔗, ✓, 📤, 🕐, ⚠, 📄, 📎, 🏢) instead of proper SVG icons. Emojis render inconsistently across platforms and look amateur in a business context.

2. **Currency display** — The dual currency shows EUR as primary but the BRL conversion is not clearly subordinated. Need: `600,00 €` as main value with `≈ 3.660,00 R$` in smaller/lighter text right after.

## Plan

### 1. Replace all emoji icons with inline SVGs

Replace every emoji in the HTML template with clean, minimal SVG icons (Lucide-style, stroke-width 1.5):

- `🏦` (Gateway) → bank/building SVG
- `💳` (Método) → credit-card SVG  
- `📅` (Vencimento/Criado) → calendar SVG
- `🕐` (Criado) → clock SVG
- `✏` (Editar) → pencil SVG
- `🔗` (Link) → link SVG
- `✓` (Baixa) → check SVG
- `📤` (Fluxo) → send SVG
- `⚠` (Missing) → alert-triangle SVG
- `📄` (Fatura) → file-text SVG
- `📎` (Comprovante) → paperclip SVG
- `🏢` (Company) → building SVG
- `✅` (Pago) → check-circle SVG

Create a helper function `icon(name)` that returns inline SVG strings, keeping the code clean.

### 2. Fix dual currency display

In the installment rows and summary:
- Primary: EUR value in bold/normal size → `600,00 €`
- Secondary: BRL in smaller, lighter text right next to it → `≈ 3.660,00 R$`

Update the `.b24-dual-currency` styling to be inline with the main value (not on a separate line), with reduced font-size (10-11px) and secondary color.

### 3. Improve action buttons styling

Replace emoji-prefixed button text with SVG icon + text for a cleaner look:
- `✏ Editar` → pencil-icon + "Editar"
- `🔗 Link` → link-icon + "Link"  
- `✓ Baixa` → check-icon + "Baixa"
- `📤 Fluxo` → send-icon + "Fluxo"

### Files to modify
- `supabase/functions/bitrix24-payment-tab/index.ts` — All changes in the `renderPaymentTab` function and its CSS styles

