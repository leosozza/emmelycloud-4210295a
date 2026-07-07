## Problema

O Meta/WhatsApp rejeita botões de URL dinâmica cujo valor completo é passado como variável (`{{1}}` = URL inteira). O botão precisa de:

- **URL base fixa** no template: `https://checkout.stripe.com/c/pay/`
- **Variável `{{1}}`** com apenas o **token** (ex.: `cs_live_a1QzyzYmrc...#fidnandhYHd...`)

Além disso, o token do Stripe precisa ficar guardado num campo próprio em Deals e Faturas (Smart Invoice) do Bitrix24 para que, ao enviar o template, o backend consiga preencher a variável automaticamente.

## Alterações

### 1. Novo campo no Bitrix24 (`bitrix24-install`)
Criar UF em três entidades:
- Deal → `UF_CRM_EMMELY_STRIPE_TOKEN` (string)
- Lead → `UF_CRM_EMMELY_STRIPE_TOKEN` (string)
- Smart Invoice (type 31) → `UF_CRM_31_STRIPE_TOKEN` (string)

Registar também nos `bitrix24_field_mappings` iniciais.

### 2. Extrair token do URL Stripe
Helper `extractStripeToken(url)` que devolve tudo depois de `/c/pay/` (mantendo query e fragmento). Usado onde já se grava `payment_url` / `receipt_url`:

- `supabase/functions/payment-create-link/index.ts` — ao criar sessão Stripe, gravar token junto ao link.
- `supabase/functions/bitrix24-update-deal-payment/index.ts` — quando `receipt_url` chega, popular também `UF_CRM_EMMELY_STRIPE_TOKEN` na entidade e `UF_CRM_31_STRIPE_TOKEN` nas faturas correspondentes.
- `supabase/functions/payment-create/index.ts` — persistir `stripe_token` na `payment_transactions.metadata` (para consultas futuras).

### 3. Envio de template com botão Stripe
Em `supabase/functions/gupshup-send/index.ts` (fluxo `isTemplate`):

- Se o template tiver um botão marcado como `stripe_token` (novo flag), resolver a variável do botão:
  1. Se o caller já passou o valor → usar.
  2. Senão, buscar `UF_CRM_EMMELY_STRIPE_TOKEN` do deal/lead ou `UF_CRM_31_STRIPE_TOKEN` da fatura vinculada à conversa/lead.
- Enviar o valor no array `params` do botão (posição correta) conforme API Gupshup HSM.

### 4. UI de criação de templates (`WhatsappTemplatesTab.tsx`)
No formulário de botões URL:
- Novo checkbox "Link de pagamento Stripe".
- Quando marcado:
  - URL fica bloqueada em `https://checkout.stripe.com/c/pay/{{1}}`.
  - Placeholder do "example" fica `cs_live_exemplo_token`.
  - Guardar `is_stripe_token: true` no JSON do botão (coluna `buttons` da tabela `whatsapp_templates`).

### 5. Edge function de criação de template (`whatsapp-templates-create`)
- Aceitar `is_stripe_token` nos botões e forçar `url = "https://checkout.stripe.com/c/pay/{{1}}"` + `example = ["cs_live_exemplo..."]` para passar validação Meta.

## Fora de âmbito
- Não altero campos de recibo já existentes (`UF_CRM_EMMELY_RECEIPT_URL`) — continuam com URL completo do relatório interno.
- Não mexo em Paddle nem em cobranças legadas.

## Detalhes técnicos

```ts
// helper
export function extractStripeToken(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/c\/pay\/(.+)$/);
  return m ? m[1] : null;
}
```

Payload Gupshup HSM com botão URL dinâmico:
```
template={"id":"<tpl_id>","params":["<var1>","<var2>"]}
```
Botões URL dinâmicos entram como último(s) parâmetro(s) na ordem em que aparecem.

Migração SQL: nenhuma necessária no Supabase — os botões já são `jsonb` em `whatsapp_templates`; o flag `is_stripe_token` vive dentro desse JSON.