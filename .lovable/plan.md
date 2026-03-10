

## Improve Payment Tab Placement Layout

The payment tab (`bitrix24-payment-tab` edge function) renders HTML inside a Bitrix24 iframe. The current layout is functional but visually flat. Here is the plan to professionalize it.

### Changes (all in `supabase/functions/bitrix24-payment-tab/index.ts`)

#### 1. Summary Section Redesign
- Replace the flat summary grid with card-style stat boxes with subtle background colors (green for paid, red/orange for open, neutral for total)
- Add rounded corners and slight shadows to stat items
- Make the progress bar thicker (6px) with a gradient fill and animated transition
- Add percentage label inline with the progress bar instead of below

#### 2. Installment Card Improvements
- Increase card border-radius from 4px to 8px
- Add left accent border (4px) colored by status (green=paid, orange=pending, red=overdue)
- Better vertical spacing between card sections (header, meta, actions)
- Make the installment title and value more prominent with larger font sizes
- Dual currency: EUR value bold/primary, BRL value inline right after in smaller muted text (`≈ R$ 3.660,00`)

#### 3. Action Buttons Polish
- Increase button padding and add subtle rounded corners (6px)
- Add icon+text alignment with proper gap
- Color-code buttons: green for "Baixa", blue for "Fluxo", neutral for "Editar" and "Link"
- Add hover transitions with background color shifts

#### 4. General Polish
- Add `font-smoothing` and better font rendering
- Improve dark mode contrast for cards and buttons
- Better empty state with larger icon and centered layout
- Add subtle hover effect on installment cards (lift shadow)
- Fix the "Criar Cobrança" button to be more prominent with an icon

#### 5. Summary Info Row
- Replace inline text with pill-style meta items (rounded bg with icon+label+value)
- Better spacing and wrapping on mobile

### Technical approach
- All changes are CSS + HTML template modifications within the `renderPaymentTab` function
- No structural/logic changes to the edge function handler
- Redeploy the edge function after changes

