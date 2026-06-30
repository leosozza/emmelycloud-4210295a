## Problema

A aba **Pagamentos** em `/integracoes` mostra Stripe PT/BR e Asaas como **Inativo** quando aberta dentro do iframe do Bitrix24, mesmo com as chaves configuradas (que aparecem como **Ativo** quando acedida diretamente no navegador).

## Causa raiz

`PagamentosTab` chama a edge function `manage-credentials` (GET) para descobrir o estado das credenciais. Essa função exige `Authorization: Bearer <jwt do utilizador>` e faz `supabase.auth.getUser()` para identificar o operador.

Dentro do iframe do Bitrix24, a sessão Supabase **não está disponível** (o utilizador normalmente não fez login na app Lovable a partir do portal Bitrix, e o navegador bloqueia o `localStorage`/cookies de terceiros do domínio Lovable embutido). Resultado: a chamada volta sem `credentials` → todos os cards caem para `has_value = false` → badge "Inativo" e botão "Testar Conexão" desativado.

Não há problema nas chaves nem no backend de pagamentos — é exclusivamente o leitor de estado que falha sem auth.

## Solução

Criar um endpoint **público e read-only** que devolva apenas flags booleanas de presença das credenciais (nunca o valor, nem mascarado), e usá-lo como fallback no `PagamentosTab` quando não há sessão.

### 1. Nova edge function `payment-providers-status` (pública)

- `verify_jwt = false`, sem `auth.getUser()`.
- Usa `SERVICE_ROLE_KEY` apenas para ler `integration_credentials` e devolver:
  ```json
  {
    "stripe_pt": { "secret": true, "webhook": true },
    "stripe_br": { "secret": true, "webhook": false },
    "asaas":     { "api_key": true, "webhook_token": true, "environment": "production" }
  }
  ```
- Devolve **só booleanos** + `environment` (`sandbox`/`production`) para o Asaas, que já é um valor não-sensível.
- Sem mascaramento, sem totais por gateway, sem listagem — minimiza a superfície pública.

### 2. Ajuste em `src/pages/Integracoes.tsx` (`PagamentosTab`)

- Em `loadCredentials`, depois da chamada a `manage-credentials`:
  - Se a resposta veio vazia / sem auth, fazer fallback para `payment-providers-status` e popular `credentials` apenas com `has_value` (sem `masked`).
- Quando o estado vier do endpoint público:
  - Inputs de Secret/Webhook ficam **desativados** com placeholder "Configurado (abra fora do Bitrix24 para editar)".
  - Botões "Testar Conexão" permanecem ativos — a função `manage-credentials` action `test_*` continua a precisar de auth, então mantemos o botão ativo apenas quando há sessão; caso contrário mostramos tooltip "Faça login na app para testar".
- Badge "Ativo/Inativo" e o seletor Sandbox/Produção do Asaas passam a refletir o estado real mesmo no iframe.

### 3. Sem mudanças noutros componentes

- `manage-credentials` permanece intocada (ainda exige auth para leitura mascarada, escrita e teste).
- Sem alterações em `payment-webhook-*`, `asaas-client`, `Webhook URL`, etc.
- Sem migrações de DB nem novos secrets.

## Resultado

Dentro do iframe Bitrix24 a aba Pagamentos mostra corretamente os badges **Ativo** para Stripe PT, Stripe BR e Asaas (e o ambiente do Asaas), igual à vista fora do iframe. Edição continua restrita a sessão autenticada.