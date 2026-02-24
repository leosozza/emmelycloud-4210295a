

# Implementar Todos os Metodos de Pagamento Stripe (Checkout Sessions)

## Abordagem

Migrar de **Payment Intents** (que so suporta `card`) para **Stripe Checkout Sessions** com `payment_method_types` explicitos. Isto permite que o Stripe apresente automaticamente todos os metodos de pagamento disponiveis, incluindo Multibanco, MB WAY, SEPA, Apple Pay, etc.

## Metodos de Pagamento a Ativar

| Metodo | Codigo Stripe | Regiao |
|--------|--------------|--------|
| Cartao (Visa, MC, Amex) | `card` | Global |
| SEPA Direct Debit | `sepa_debit` | Europa |
| Multibanco | `multibanco` | Portugal |
| MB WAY | `mbway` | Portugal (requer Stripe >= 2023) |
| iDEAL | `ideal` | Holanda/UE |
| Bancontact | `bancontact` | Belgica |
| giropay | `giropay` | Alemanha |
| Sofort | `sofort` | Alemanha/Europa |
| Klarna | `klarna` | Europa |
| Link | `link` | Global |

**Nota:** Apple Pay e Google Pay sao ativados automaticamente quando `card` esta presente no Checkout Sessions -- nao necessitam de tipo separado.

## Alteracoes Tecnicas

### 1. `supabase/functions/payment-create/index.ts`

**Substituir** a funcao `createStripePayment` para usar a API de Checkout Sessions:

- Trocar o endpoint de `/v1/payment_intents` para `/v1/checkout/sessions`
- Adicionar todos os `payment_method_types[]` listados acima
- Adicionar `mode=payment` e URLs de `success_url` / `cancel_url`
- Adicionar `line_items` com o valor e descricao
- Retornar o `session.url` como `payment_url` (o cliente e redirecionado para a pagina hosted do Stripe)
- Manter o `gateway_payment_id` como o ID do Payment Intent associado (via `payment_intent` no response)

A assinatura da funcao passa a aceitar um parametro `return_url` opcional para redirect apos pagamento.

### 2. `supabase/functions/bitrix24-payment-handler/index.ts`

Aplicar a mesma migracao para Checkout Sessions na secao Stripe deste handler, substituindo o bloco de Payment Intent (~linhas 237-253) pelo mesmo padrao de Checkout Session.

### 3. `supabase/functions/payment-webhook-stripe/index.ts`

Verificar que o webhook ja trata o evento `checkout.session.completed` -- caso contrario, adicionar handler para este evento que:
- Extrai o `payment_intent` da session
- Atualiza o status da transacao na tabela `payment_transactions`

### Impacto

- **2-3 ficheiros** de Edge Functions alterados
- **Sem alteracoes de base de dados** -- a tabela `payment_transactions` ja suporta `payment_url`
- **Sem alteracoes no frontend** -- o fluxo passa a redirecionar para o Checkout hosted do Stripe
- O Stripe so apresenta os metodos ativados na conta do cliente (ex: se a conta e de Portugal, Multibanco e MB WAY aparecem automaticamente)

