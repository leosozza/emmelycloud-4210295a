

# Corrigir Domínio dos Links de Proposta/Contrato/Pagamento

## Problema

Todos os links públicos (propostas, contratos, pagamentos) usam o fallback hardcoded `https://emmelycloud.lovable.app` em vez do domínio Cloudflare Pages `https://emmelycloud.pages.dev`. A variável `FRONTEND_URL` existe no código mas não está configurada como secret.

## Solução

Configurar o secret `FRONTEND_URL` com o valor `https://emmelycloud.pages.dev` e substituir todos os fallbacks hardcoded para consistência.

## Alterações

### 1. Adicionar secret `FRONTEND_URL`

Valor: `https://emmelycloud.pages.dev`

### 2. Actualizar fallbacks em 3 ficheiros

Substituir todas as ocorrências de `"https://emmelycloud.lovable.app"` por `Deno.env.get("FRONTEND_URL") || "https://emmelycloud.pages.dev"`:

- **`supabase/functions/bitrix24-robot-handler/index.ts`** — 3 ocorrências (linhas 732, 846, 1098)
- **`supabase/functions/payment-create/index.ts`** — 1 ocorrência (linha 63)
- **`supabase/functions/bitrix24-payment-handler/index.ts`** — 1 ocorrência (linha 288)

Isto garante que mesmo sem o secret configurado, o fallback já aponta para o domínio correcto.

