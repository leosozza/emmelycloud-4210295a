## Objetivo

Adicionar suporte, no mesmo padrão do botão Stripe, para o link de pagamento interno Emmely (`https://emmelycloud.pages.dev/pagamento/{{1}}`), onde `{{1}}` é o `id` do `payment_transactions` / `financial_records` (ex.: `799e3b72-...`).

## Alterações

### 1. `whatsapp-templates-create/index.ts`
- Adicionar constantes:
  - `EMMELY_BUTTON_URL = "https://emmelycloud.pages.dev/pagamento/{{1}}"`
  - `EMMELY_BUTTON_EXAMPLE = "799e3b72-833b-49b2-8c34-115f6852b7c1"`
- Aceitar nova flag no botão: `is_emmely_token?: boolean`.
- Ao montar o payload Gupshup, quando `is_emmely_token` for `true`, forçar `url = EMMELY_BUTTON_URL` e `example = [EMMELY_BUTTON_EXAMPLE]`.
- Atualizar `exampleMedia` para incluir também o caso Emmely (`https://emmelycloud.pages.dev/pagamento/<exemplo>`).

### 2. `src/components/configuracoes/WhatsappTemplatesTab.tsx`
- Novo botão rápido **"🔗 Pagamento Emmely"** ao lado de "💳 Pagamento Stripe", que adiciona um botão do tipo `URL` com:
  - `text: "Pagar"`
  - `is_emmely_token: true`
  - `url: "https://emmelycloud.pages.dev/pagamento/{{1}}"` (readonly na UI)
- No render/edição, se `is_emmely_token`, mostrar badge "Emmely" e bloquear edição do campo URL (igual ao Stripe).
- Persistir a flag em `whatsapp_templates.buttons` (jsonb — sem migração).

### 3. `gupshup-send/index.ts` (envio de template)
- No handler que resolve variáveis do template para pagamento, além de `UF_CRM_EMMELY_STRIPE_TOKEN`, resolver também token Emmely:
  - Preferência: `payment_transactions.id` mais recente vinculado ao deal/lead/fatura.
  - Fallback: `financial_records.id` correspondente.
- Passar esse UUID como `params[n]` do botão quando o template tiver botão marcado `is_emmely_token`.

### 4. Sem mudanças em Bitrix24 install
- Não é necessário novo campo customizado — o token Emmely é o `id` do registro em `payment_transactions`/`financial_records`, já existente no banco. Diferente do Stripe (que precisava guardar o `cs_live_...` retornado pela Stripe), o Emmely já conhece esse UUID nativamente.

## Fora de escopo
- Alterar rota `/pagamento/:id` no frontend (já existe).
- Migrações SQL (coluna `buttons` é `jsonb`).
- Retrocompatibilidade de templates antigos (usuário recria pela UI).
