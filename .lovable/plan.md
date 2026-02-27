

## Revisão da Integração Stripe — Análise Completa

### Estado Atual

A integração Stripe está **funcional e bastante completa**, cobrindo:

1. **Criação de pagamentos** (`payment-create`) — Checkout Sessions com 8 métodos de pagamento (card, sepa_debit, multibanco, ideal, bancontact, sofort, klarna, link)
2. **Webhook** (`payment-webhook-stripe`) — Verificação de assinatura HMAC-SHA256, processa 5 eventos (succeeded, failed, canceled, refunded, checkout.session.completed)
3. **Consulta de status** (`payment-status`) — Consulta em tempo real à API Stripe
4. **Handler Bitrix24** (`bitrix24-payment-handler`) — Modo CHECKOUT nativo no CRM
5. **Notificação Bitrix24** — Atualiza Deal, Timeline, Smart Invoices automaticamente
6. **UI de configuração** — Credenciais, webhook URL, guia passo-a-passo, teste de conexão

### Problemas Identificados

#### 1. Sem conversão automática de moeda EUR↔BRL
O sistema **não converte moedas**. O roteamento é por região:
- EUR → Stripe (Portugal/Europa)
- BRL → Asaas (Brasil)

Cada gateway processa na moeda nativa. Não há conversão EUR→BRL nem vice-versa. O `LocaleContext` tem uma taxa fixa (`EUR_TO_BRL = 6.10`) mas é apenas para **exibição** no frontend, não afeta pagamentos reais.

**Isto é correto por design** — cada gateway opera na sua moeda local. Uma conversão real exigiria câmbio no momento da transação, que o Stripe já faz nativamente se a conta suportar múltiplas moedas.

#### 2. Evento `checkout.session.completed` falta no hint do webhook
A UI de configuração (linha 710) lista apenas 4 eventos mas o webhook processa 5. Falta `checkout.session.completed` na instrução ao utilizador.

#### 3. `getCredential` sem `.trim()` no webhook Stripe
O `payment-create` faz `.trim()` nas credenciais (linha 16), mas o `payment-webhook-stripe` e `payment-status` **não fazem** (linha 15 de ambos). Isto pode causar erros de ByteString se houver espaços/quebras de linha invisíveis nas credenciais.

#### 4. Financeiro.tsx hardcoded em EUR
A página Financeiro formata sempre em EUR (linhas 73, 83) sem usar o `LocaleContext`/`formatCurrency`. Deveria respeitar a moeda da transação (campo `currency` já existe em `payment_transactions`).

#### 5. MB WAY ausente nos métodos de pagamento
O `payment-create` lista `multibanco` mas não inclui `mb_way` explicitamente (embora o Stripe Checkout Sessions possa apresentá-lo automaticamente dependendo da versão da API e região da conta).

### Plano de Melhorias

#### Passo 1: Adicionar `.trim()` nas Edge Functions de webhook e status
Corrigir `getCredential` em `payment-webhook-stripe` e `payment-status` para aplicar `.trim()` — prevenção de erros ByteString.

#### Passo 2: Corrigir hint do webhook na UI
Adicionar `checkout.session.completed` à lista de eventos na página de Integrações.

#### Passo 3: Usar moeda da transação na página Financeiro
Substituir o hardcode `EUR` por `tx.currency` nos KPIs (já existe o campo).

#### Passo 4: Adicionar `mb_way` aos métodos de pagamento Stripe
Incluir `mb_way` na lista de `payment_method_types` no `payment-create` e `bitrix24-payment-handler`.

### Detalhes Técnicos

Ficheiros a alterar:
- `supabase/functions/payment-webhook-stripe/index.ts` — `.trim()` no `getCredential`
- `supabase/functions/payment-status/index.ts` — `.trim()` no `getCredential`
- `supabase/functions/payment-create/index.ts` — adicionar `mb_way`
- `supabase/functions/bitrix24-payment-handler/index.ts` — adicionar `mb_way`, `.trim()`
- `src/pages/Integracoes.tsx` — hint do webhook com `checkout.session.completed`
- `src/pages/Financeiro.tsx` — usar `tx.currency` em vez de hardcode EUR

