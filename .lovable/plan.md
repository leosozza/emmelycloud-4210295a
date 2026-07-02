## Problema

O link que abriste — `emmelycloud.pages.dev/pagamento/...` — aponta para o build **Cloudflare Pages**, que continua a servir o layout antigo (verde, com emojis). O redesign Stripe já está no código React, mas nenhuma re-publicação chegou ao Cloudflare. As Edge Functions constroem os links usando `FRONTEND_URL` (default `emmelycloud.pages.dev`), por isso todo o link enviado a cliente cai no build velho.

## Objetivo

Garantir que qualquer link `/pagamento/:token` — recém-gerado ou já enviado — abra o layout novo em `emmelycloud.lovable.app`, sem depender de re-publicar o Cloudflare Pages.

## Alterações

### 1. Redirect em `public/_redirects` (Cloudflare Pages)
Cloudflare Pages **respeita** `_redirects` (ao contrário do Lovable hosting). Adicionar uma regra 302 no topo:

```
/pagamento/*  https://emmelycloud.lovable.app/pagamento/:splat  302
```

Isto resolve **os links já enviados** aos clientes (deal 45807 etc.) assim que houver um redeploy do Pages. Se o Pages não for re-publicado, este passo fica inerte — nesse caso o passo 2 é o que passa a valer para links novos.

### 2. Centralizar `publicReceiptBase()` num helper partilhado
Criar `supabase/functions/_shared/public-urls.ts`:

```ts
export function publicReceiptBase(): string {
  return (Deno.env.get("PUBLIC_RECEIPT_URL") || "https://emmelycloud.lovable.app").replace(/\/+$/, "");
}
export function receiptUrl(token: string, qs = ""): string {
  return `${publicReceiptBase()}/pagamento/${token}${qs}`;
}
```

### 3. Trocar todos os geradores de link `/pagamento/${token}`
Substituir o padrão atual (`FRONTEND_URL || emmelycloud.pages.dev`) por `receiptUrl(token)` nestes ficheiros:

- `supabase/functions/bitrix24-install/index.ts` (linha 342)
- `supabase/functions/bitrix24-payment-tab/index.ts` (linhas 1090, 1967, 2622 — substituir `FRONTEND_BASE + '/pagamento/'` por uma constante `RECEIPT_BASE` injetada com `PUBLIC_RECEIPT_URL`)
- `supabase/functions/bitrix24-robot-handler/index.ts` (linhas 1430-1431 e onde constrói link do comprovante)
- `supabase/functions/payment-create/index.ts` (linhas 290-291)
- `supabase/functions/payment-create-link/index.ts` (linhas 416-418: `successUrl` e `cancelUrl`)

**Não alterar** `FRONTEND_URL` nas funções que precisam voltar ao iframe Bitrix/dashboard interno (sign-contract callback interno, proposal-accept, bitrix24-payment-handler successUrl que retorna à conta Bitrix, etc.). Só o **link público do comprovante/parcela** é migrado.

### 4. Deploy das Edge Functions afetadas
Após as edições, as funções são redeployadas automaticamente pelo Lovable Cloud — links novos já saem apontando para `emmelycloud.lovable.app`.

## Resultado esperado

- **Links novos** (criados após esta mudança em qualquer fluxo — manual, robot, Emmely Pay, checkout success/cancel) abrem diretamente no domínio Lovable com o design Stripe.
- **Links antigos** que ficaram armazenados no Bitrix apontando para `pages.dev` passam a redirecionar via `_redirects` (assumindo que o Cloudflare Pages seja re-publicado uma vez para pegar o ficheiro).
- Fluxos internos do Bitrix (retornos ao iframe, dashboards, tabs) continuam a usar `FRONTEND_URL` inalterado.

## Fora do escopo

- Não é feita migração/UPDATE em massa nos campos `UF_CRM_EMMELY_RECEIPT_URL` de deals antigos no Bitrix. Se quiseres, faço num segundo passo com uma função one-shot.
- Findings de segurança que bloqueiam `preview_ui--publish` não são tocados aqui — para atualizar o build do Lovable basta clicares em **Publish → Update**.
