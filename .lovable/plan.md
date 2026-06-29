## Diagnóstico

Investiguei a base de dados e o código do separador. Existem duas causas distintas para os sintomas:

### 1. "Stripe aparece como não configurado" no Bitrix
Há **três** registos Stripe em `integration_credentials`:

| provider   | credential_key            | tipo de chave        |
|------------|---------------------------|----------------------|
| stripe_pt  | STRIPE_SECRET_KEY_PT      | `sk_live_…` ✅ válida |
| stripe_br  | STRIPE_SECRET_KEY_BR      | `sk_live_…` ✅ válida |
| **stripe** | **STRIPE_SECRET_KEY**     | **`pk_live_…` ❌ chave publicável** |

O registo legado `stripe / STRIPE_SECRET_KEY` contém uma **publishable key** (pk_), que é exatamente o que a memória do projeto e o validador do `manage-credentials` rejeitam. Quando a tela de Integrações no Bitrix lê esse registo, mostra-o como inválido / "não configurado", mesmo com as chaves regionais corretas guardadas.

O `payment-create-link` também tenta esse registo como fallback (4ª opção da lista de candidatos) — se a moeda do negócio não bater certo com PT/BR, cai no `stripe / STRIPE_SECRET_KEY` (pk_) e o Stripe rejeita.

### 2. Triângulo vermelho "Não é possível mostrar o app no contexto atual"
Erro genérico do Bitrix24 quando o iframe do placement falha. Os logs de `bitrix24-payment-tab` mostram que a última invocação respondeu 200 e renderizou HTML, mas o `try/catch` final devolve **500** em caso de exceção. Bitrix interpreta qualquer resposta não-HTML/erro como "contexto inválido" e mostra o triângulo. Acontece em condições transitórias (token expirado, deal sem dados, falha de fetch para o Bitrix).

## Mudanças propostas

### A. Limpar credenciais Stripe inválidas
1. Apagar a linha `provider=stripe, credential_key=STRIPE_SECRET_KEY` (pk_live_… inválida) via migration SQL.
2. Manter `STRIPE_WEBHOOK_SECRET` (provider=stripe) — webhook secrets `whsec_…` são legítimos.

### B. Endurecer a leitura de credenciais
1. Em `payment-create-link/index.ts`: nos candidatos de chave, **filtrar qualquer valor que comece por `pk_`** antes de aceitar como `stripeKey`. Isto evita que uma publishable key residual seja usada.
2. Em `manage-credentials/index.ts` (action `test_stripe`): já bloqueia pk_, mas adicionar o mesmo bloqueio no upsert genérico para qualquer `credential_key` que contenha "STRIPE" e "SECRET" — não apenas quando contém "STRIPE".

### C. Eliminar o triângulo vermelho do Emmely Pay
1. Em `supabase/functions/bitrix24-payment-tab/index.ts`, alterar o `catch` final (linha ~2368) para devolver **HTTP 200** com HTML que mostra a mensagem de erro estilizada, em vez de 200 com `<html><body><p>` cru. Bitrix só desenha o iframe corretamente quando recebe 200 + HTML com os cabeçalhos `X-Frame-Options: ALLOWALL` / `frame-ancestors *`. Garantir que `htmlHeaders` é sempre aplicado.
2. Adicionar `try/catch` em redor de `ensureValidToken` — se a renovação falhar, renderizar a tab em modo "sem ligação" (`noData: true`) em vez de propagar exceção.
3. Mesma proteção no `bitrix24-crm-tab` (Emmely AI) por consistência — também é placement de Deal.

### D. Verificação
Após deploy, abrir o negócio 44755 e o separador Emmely Pay deverá:
- Carregar sem o triângulo vermelho.
- Ao clicar em "Gerar link de pagamento", usar a `STRIPE_SECRET_KEY_PT` correta e devolver o checkout Stripe.

## Ficheiros tocados

- `supabase/migrations/<timestamp>_remove_invalid_stripe_pk.sql` (novo)
- `supabase/functions/payment-create-link/index.ts`
- `supabase/functions/manage-credentials/index.ts`
- `supabase/functions/bitrix24-payment-tab/index.ts`
- `supabase/functions/bitrix24-crm-tab/index.ts`

Nenhum frontend é alterado. O fluxo de envio de áudio / instalação do app não é tocado.
