

## Integrar Seletor de Gateway de Pagamento no Fechamento de Negócio Bitrix24

Quando um negócio (deal) for fechado no Bitrix24, o sistema lerá automaticamente o campo personalizado de gateway de pagamento e criará a cobrança no gateway correto.

### Gateways Suportados

| Gateway | Região | Moeda |
|---------|--------|-------|
| Stripe PT | Portugal | EUR |
| Stripe BR | Brasil | BRL |
| Asaas | Brasil | BRL |
| Financiamento Próprio | Ambas | EUR/BRL |

### Plano de Implementação

#### 1. Adicionar evento `ONCRMDEALUPDATE` ao pipeline de eventos
- Adicionar `ONCRMDEALUPDATE` à lista `SUPPORTED_EVENTS` em `bitrix24-events/index.ts`
- O evento será enfileirado na `bitrix_event_queue` como os outros

#### 2. Criar handler de deal no worker (`bitrix24-worker`)
- Quando o evento `ONCRMDEALUPDATE` chegar, o worker:
  - Busca os dados completos do deal via API Bitrix (`crm.deal.get`)
  - Verifica se o deal foi movido para o stage "WON" (ganho/fechado)
  - Lê o campo personalizado de gateway (ex: `UF_CRM_GATEWAY_PAGAMENTO`)
  - Lê os campos de valor, moeda, dados do cliente
  - Chama `payment-create` com o gateway especificado

#### 3. Adicionar configuração do campo no sidebar Emmely Pay
- Na view de Pagamentos do Bitrix24App, adicionar secção de configuração:
  - Campo para informar o ID do campo personalizado do Bitrix (ex: `UF_CRM_1234567890`)
  - Campo para o stage ID de "fechado/ganho"
  - Guardar na tabela `bitrix24_integrations.config` (JSON)

#### 4. Atualizar `payment-create` para suportar gateway explícito
- Adicionar parâmetro `force_gateway` que permite forçar `stripe_pt`, `stripe_br`, `asaas` ou `direto`
- Manter o roteamento automático como fallback quando não especificado

### Detalhes Técnicos

**Ficheiros a alterar:**
- `supabase/functions/bitrix24-events/index.ts` -- adicionar `ONCRMDEALUPDATE`
- `supabase/functions/bitrix24-worker/index.ts` -- handler para processar deal update
- `supabase/functions/payment-create/index.ts` -- suporte a `force_gateway`
- `src/pages/Bitrix24App.tsx` -- UI de configuração do campo gateway na secção Pagamentos

**Tabela `bitrix24_integrations.config`** (campo JSON existente) guardará:
```json
{
  "deal_gateway_field": "UF_CRM_1234567890",
  "deal_won_stage": "WON",
  "deal_amount_field": "OPPORTUNITY",
  "deal_currency_field": "CURRENCY_ID",
  "auto_charge_on_close": true
}
```

