## Problema

Os links `/pagamento/{token}` estão a ser gerados como `https://emmelycloud.lovable.app/pagamento/...`, mas o hosting oficial (memória do projeto) é Cloudflare Pages → `https://emmelycloud.pages.dev`.

Causa: várias edge functions usam `Deno.env.get("PUBLIC_RECEIPT_URL") || "https://emmelycloud.lovable.app"` como fallback. Como o secret `PUBLIC_RECEIPT_URL` não está definido, cai sempre no fallback errado.

## Correção

### 1. Trocar fallback nas edge functions

Substituir o default `"https://emmelycloud.lovable.app"` por `"https://emmelycloud.pages.dev"` em:

- `supabase/functions/payment-receipt/index.ts:43`
- `supabase/functions/payment-create-link/index.ts:416`
- `supabase/functions/payment-create/index.ts:291`
- `supabase/functions/bitrix24-payment-tab/index.ts:1096` (`FRONTEND_BASE` injetado no HTML do iframe)
- `supabase/functions/bitrix24-robot-handler/index.ts:1959`
- `supabase/functions/bitrix24-install/index.ts:502`

(Mantém a leitura de `PUBLIC_RECEIPT_URL` — permite override no futuro.)

### 2. Remover `public/_redirects`

O ficheiro atual redireciona `/pagamento/*` para `emmelycloud.lovable.app` — reforça o bug e Lovable/Cloudflare ignoram o formato Netlify. Apagar `public/_redirects`.

### 3. Redeploy

Redeploy das 6 edge functions acima para os links passarem a apontar para `emmelycloud.pages.dev`.

## Fora de escopo

- Não altero os `FRONTEND_URL` do Stripe success/cancel (já são `emmelycloud.pages.dev`).
- Não altero o URL do `bitrix24-im-send-audio.html` (comentário explica que precisa mesmo estar em `.lovable.app` por causa do 405 no Cloudflare Pages).
- Links já gravados em faturas antigas do Bitrix continuam com o domínio antigo — só novos links usam o novo domínio. Se quiseres, faço uma migração/reescrita depois.

## Validação

1. Gerar um novo link de cobrança → URL deve começar por `https://emmelycloud.pages.dev/pagamento/…`.
2. Abrir iframe Emmely Pay num deal → botões "Copiar link" produzem URL `pages.dev`.
3. Robot `emmely_create_charge` → mensagem WhatsApp / campo `UF_CRM_EMMELY_PAYMENT_URL` com domínio `pages.dev`.
