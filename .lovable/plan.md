

# Integrar Pagamentos: Stripe (Portugal) + Asaas (Brasil) via Bitrix24

## Contexto

O projeto de referencia (bitrix24-asaas-link / ConnectPay) ja tem uma integracao funcional entre Bitrix24 e Asaas com:
- Processamento de pagamentos via PIX, Boleto e Cartao de Credito
- Webhook para atualizar status automaticamente
- Iframe de pagamento dentro do Bitrix24
- Sistema multi-tenant com split de pagamentos

Vamos adaptar este modelo para o Emmely Cloud, adicionando Stripe para clientes de Portugal e mantendo Asaas para clientes do Brasil.

## Arquitetura

O sistema vai determinar automaticamente qual gateway usar baseado no pais do cliente:
- **Portugal / Europa** -> Stripe (EUR, cartao, MB Way futuro)
- **Brasil** -> Asaas (PIX, Boleto, Cartao de Credito)

```text
Cliente/Contrato -> Pais do Cliente -> Portugal? -> Stripe
                                    -> Brasil?   -> Asaas
```

## O que sera feito

### 1. Novas tabelas no banco de dados

**`payment_transactions`** - Tabela unificada de transacoes (substitui a dependencia da `financial_records` existente para tracking de gateways):
- `id`, `contract_id` (FK), `client_id` (FK)
- `gateway` (stripe | asaas)
- `gateway_payment_id` (ID do Stripe/Asaas)
- `gateway_customer_id`
- `amount`, `currency` (EUR | BRL)
- `payment_method` (card | pix | boleto | transfer)
- `status` (pending | confirmed | received | overdue | refunded | canceled)
- `payment_url` (link de pagamento Stripe/Asaas)
- `pix_qr_code`, `pix_code` (campos especificos Asaas)
- `metadata` (jsonb para dados extras)
- `created_at`, `updated_at`

**`payment_gateway_config`** - Configuracao dos gateways por ambiente:
- `id`, `gateway` (stripe | asaas)
- `environment` (test | production)
- `is_active`
- `config` (jsonb - wallet splits, etc.)
- `created_at`, `updated_at`

### 2. Novas Edge Functions

**`payment-create`** - Criar cobranca unificada:
- Recebe: `contract_id`, `amount`, `currency`, `payment_method`, `customer_data`
- Determina gateway pelo pais/moeda
- Stripe: cria Payment Intent ou Payment Link
- Asaas: cria cobranca via API (PIX/Boleto/Cartao) - baseado no `bitrix-payment-process` do projeto referencia
- Grava na `payment_transactions`

**`payment-webhook-stripe`** - Webhook do Stripe:
- Recebe eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, etc.
- Atualiza status na `payment_transactions`
- Atualiza `financial_records` correspondente

**`payment-webhook-asaas`** - Webhook do Asaas:
- Baseado no `asaas-webhook` do projeto referencia
- Recebe eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, etc.
- Atualiza status na `payment_transactions`
- Atualiza `financial_records` correspondente

**`payment-status`** - Consultar status de um pagamento:
- Consulta diretamente no gateway (Stripe ou Asaas)
- Retorna status atualizado

### 3. Atualizar a aba Pagamentos em `/integracoes`

Substituir os cards placeholder por cards funcionais:

**Card Stripe:**
- Status da integracao (chave configurada sim/nao)
- Modo: Test / Live
- Campo para configurar Stripe Secret Key e Webhook Secret via `CredentialInput`
- Botao "Testar Conexao"

**Card Asaas:**
- Status da integracao
- Modo: Sandbox / Production
- Campo para Asaas API Key e Webhook Token via `CredentialInput`
- Botao "Testar Conexao"

**Card "Emmely Pay" (resumo):**
- Transacoes recentes (ultimas 10)
- Total processado por gateway
- Erros recentes

### 4. Secrets necessarios

Os seguintes secrets precisam ser configurados pelo utilizador:
- `STRIPE_SECRET_KEY` - ja pode existir (verificar)
- `STRIPE_WEBHOOK_SECRET` - para validar webhooks
- `ASAAS_API_KEY` - chave da API Asaas
- `ASAAS_WEBHOOK_TOKEN` - token de validacao webhooks Asaas

Estes serao geridos via a tabela `integration_credentials` existente, usando o componente `CredentialInput` ja implementado na pagina.

## Detalhes tecnicos

### Ficheiros a criar
1. `supabase/functions/payment-create/index.ts` - Criar cobranca
2. `supabase/functions/payment-webhook-stripe/index.ts` - Webhook Stripe
3. `supabase/functions/payment-webhook-asaas/index.ts` - Webhook Asaas
4. `supabase/functions/payment-status/index.ts` - Consultar status

### Ficheiros a modificar
1. `src/pages/Integracoes.tsx` - Refazer `PagamentosTab` com cards funcionais
2. `supabase/config.toml` - Registar novas functions com `verify_jwt = false` (webhooks)

### Migracao SQL
- Criar tabelas `payment_transactions` e `payment_gateway_config`
- RLS: admins e financeiro com acesso total; service role para edge functions
- Habilitar realtime em `payment_transactions` para atualizacoes ao vivo

### Logica de roteamento de gateway
```text
function getGateway(client):
  if client.country == 'Brasil' or currency == 'BRL':
    return 'asaas'
  else:
    return 'stripe'  // Default para Portugal/Europa
```

### Fluxo Asaas (adaptado do projeto referencia)
1. Encontrar/criar cliente no Asaas por CPF/CNPJ
2. Criar cobranca (PIX -> gerar QR Code, Boleto -> gerar link, Cartao -> processar)
3. Devolver URL/QR Code para o frontend
4. Webhook atualiza status automaticamente

### Fluxo Stripe
1. Criar Payment Intent com amount e currency
2. Devolver client_secret para o frontend (ou Payment Link)
3. Webhook atualiza status automaticamente

## Ordem de implementacao

1. Migracoes SQL (tabelas + RLS)
2. Edge Functions (payment-create, webhooks)
3. Atualizar config.toml
4. Refazer PagamentosTab na pagina de Integracoes
5. Testar conexao com ambos os gateways

