
# Portar integração Bitrix24 ↔ Asaas para o Emmely Cloud

## Contexto

O repositório `bitrix24-asaas-link` (Thoth24) é um SaaS standalone com ~30 edge functions e ~50 migrations cobrindo: cobranças avulsas Asaas (PIX/Boleto/Cartão), assinaturas recorrentes, emissão de NFSe, webhooks, robots Bizproc no Bitrix24, e placement de detalhe de Deal.

O Emmely Cloud já tem:
- Bitrix24 OAuth + placements (`bitrix24-payment-tab`, `bitrix24-crm-tab`)
- Gateway Stripe (PT e BR) com `payment_transactions`, `financial_records`, multi-empresa
- `payment-create` / `payment-create-link` já em produção

Plano: **adicionar Asaas como gateway adicional**, reusando o que já existe (tabelas de transação, placement Emmely Pay, fluxo de OAuth Bitrix). Sem substituir Stripe.

## Escopo desta fase

1. **Gateway de cobrança Asaas** — gera link de pagamento (PIX/Boleto/Cartão) para um Deal, grava em `payment_transactions`, sincroniza status via webhook.
2. **Assinaturas Asaas** — recorrência mensal/anual a partir de um Deal/proposta, com cron de manutenção.
3. **NFSe** — emissão automática quando a cobrança Asaas é paga (`invoiceOnPayment`), com armazenamento do PDF.
4. **Robots Bizproc** — registrar 3 robots no Bitrix24 do cliente para disparar do funil: "Gerar cobrança Asaas", "Criar assinatura Asaas", "Emitir NFSe".

Fora desta fase: páginas próprias de dashboard Asaas (Subscriptions/Transactions/Splits separadas) — vamos integrar tudo no módulo Financeiro/Emmely Pay existente.

## Mudanças no banco

Migration única (com GRANTs + RLS) criando:

- `asaas_accounts` — credenciais por `company_id` (api_key, env `sandbox`/`production`, wallet_id, default_billing_type).
- `asaas_subscriptions` — `id`, `company_id`, `deal_id`, `customer_id`, `asaas_subscription_id`, `cycle`, `value`, `next_due_date`, `status`, `metadata`.
- `asaas_invoices` — NFSe emitidas: `id`, `payment_transaction_id`, `asaas_invoice_id`, `status`, `pdf_url`, `xml_url`, `service_description`, `value`, `effective_date`.
- `asaas_webhook_events` — log de eventos brutos com `event_id` único (idempotência).
- Extender `payment_transactions.metadata` (jsonb já existe) para guardar `asaas_payment_id`, `asaas_customer_id`, `billing_type`, `invoice_url`, `bank_slip_url`, `pix_qr_code`.
- Enum `payment_gateway` deve ganhar valor `asaas` (se ainda não tem).
- Constants de método: `pix`, `boleto`, `cartao_asaas` adicionados na normalização de `payment_gateway_config`.

## Edge functions a adicionar

Sob `supabase/functions/`:

1. `_shared/asaas-client.ts` — wrapper REST (`baseUrl` por env, `access_token` header), helpers: `createCustomer`, `createPayment`, `createSubscription`, `getPayment`, `createNFSe`, `getNFSe`. Portado de `_shared/asaas-contract-billing.ts` da referência.
2. `asaas-payment-create` — recebe `{ deal_id, company_id, value, billing_type, due_date, description, installments? }`; cria customer Asaas (a partir do contato do Deal), cria payment, grava em `payment_transactions` (idempotente via `client_submit_key` já implementado), devolve `invoice_url`/`pix_qr_code`/`bank_slip_url`.
3. `asaas-subscription-create` — análogo para `/subscriptions`, grava em `asaas_subscriptions`.
4. `asaas-nfse-issue` — chama `/invoices`, salva em `asaas_invoices`, agenda polling até `status=AUTHORIZED`.
5. `asaas-webhook` — endpoint público (`verify_jwt = false`) que valida `asaas-access-token` header contra secret por tenant, deduplica por `event_id`, atualiza `payment_transactions` / `asaas_subscriptions` / `asaas_invoices` conforme `event` (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_CYCLE_*`, `INVOICE_AUTHORIZED`). Reusa o trigger `sync_invoice_status_to_bitrix` existente.
6. `bitrix24-robot-asaas` — endpoint genérico para os 3 robots; lê `event_token`, `properties`, dispara a função interna correspondente, e responde `bizproc.event.send` ao Bitrix.
7. `bitrix24-robot-register-asaas` — chamado uma vez por tenant para `bizproc.robot.add` dos 3 robots (idempotente). Disparado a partir das configurações do Bitrix24.

Cron novo (pg_cron, via `supabase--insert`):
- `asaas-subscriptions-poll` a cada 6h — reconcilia status das assinaturas ativas (fallback caso webhook falhe).

## Mudanças no placement Emmely Pay (`bitrix24-payment-tab`)

- Seletor de gateway no formulário: `Stripe (atual)` vs `Asaas (PIX/Boleto/Cartão)` — visível só quando a `company` do Deal tem `asaas_accounts` configurado.
- Quando Asaas: campos extras de `billing_type` (radio: PIX/Boleto/Cartão) e checkbox "Emitir NFSe ao receber".
- Render `renderPaymentLinks` (já adicionado) usa `invoice_url` retornado por `asaas-payment-create`.
- Nova aba "Assinaturas" reaproveitando o mesmo modal para criar recorrência.

## Configurações (UI)

Em `DashboardSettings` / Configurações do Financeiro:
- Card "Asaas" por empresa: `api_key` (input password salvo via `manage-credentials` existente), `ambiente` (sandbox/produção), `wallet_id`, `default_billing_type`, `webhook_token`. Botão "Registrar robots no Bitrix24" → chama `bitrix24-robot-register-asaas`.
- URL do webhook exibida para colar no painel Asaas: `https://<project>.functions.supabase.co/asaas-webhook?tenant=<company_id>`.

## Secret necessário

`ASAAS_WEBHOOK_SHARED_SECRET` (gerado via `generate_secret`, 64 chars) — usado como fallback global, mas cada tenant pode ter o próprio `webhook_token` em `asaas_accounts`.

A `api_key` do Asaas é por tenant e fica em `asaas_accounts.api_key_encrypted` (mesma estratégia do `manage-credentials` que já existe), nunca em secret global.

## Ordem de execução

1. Migration (schema novo + enum `asaas` no `payment_gateway`).
2. `_shared/asaas-client.ts` + `asaas-payment-create` + `asaas-webhook` (MVP funcional: gera link e recebe pagamento).
3. UI Configurações Asaas + ajuste no placement Emmely Pay (seletor de gateway).
4. `asaas-subscription-create` + cron de poll + aba Assinaturas no placement.
5. `asaas-nfse-issue` + checkbox NFSe.
6. `bitrix24-robot-asaas` + `bitrix24-robot-register-asaas`.

## Verificação

- Sandbox Asaas: criar cobrança PIX num Deal de teste no Bitrix24 → confirmar `payment_transactions` com `gateway='asaas'` e `invoice_url` populado, modal mostra QR Code copiável.
- Disparar webhook `PAYMENT_RECEIVED` simulado → `payment_transactions.status='paid'` e `financial_records` atualizado, `UF_CRM_EMMELY_RECEIPT_URL` escrito no Deal.
- Criar assinatura mensal → `asaas_subscriptions` row criada; após 1ª cobrança paga via webhook, NFSe emitida e PDF salvo.
- Registrar robots e arrastar Deal num pipeline para fase com robot "Gerar cobrança Asaas" → cobrança criada automaticamente.

## Itens NÃO incluídos (confirmar se quer numa próxima fase)

- Páginas dedicadas `DashboardSubscriptions`, `DashboardSplits`, `DashboardTransactions` da referência.
- Split de pagamento entre wallets Asaas.
- Contratos públicos (`PublicContract` / `contract-public`) — Emmely já tem o módulo de propostas/contratos próprio.
- Multi-tenant `admin-tenant-management` — Emmely é single-tenant por instalação.
