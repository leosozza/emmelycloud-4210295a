

# Plano: Criar Smart Invoices (CRM_SMART_INVOICE) no Bitrix24 para Cada Parcela

## Objetivo

Ao criar cobranças parceladas na aba Emmely Pay, além de criar as transações no gateway de pagamento (Asaas/Stripe), o sistema também criará uma **Smart Invoice** (entityTypeId 31) no Bitrix24 para cada parcela. Assim, as faturas aparecem diretamente no CRM e podem ser geridas nativamente. Quando o webhook de pagamento confirmar o pagamento, a fatura correspondente será marcada como paga no Bitrix24.

## Alterações

### 1. Criar Smart Invoices ao criar cobranças (`bitrix24-payment-tab/index.ts`)

Após cada chamada bem-sucedida a `payment-create`, o JavaScript do iframe chamará a API Bitrix24 via `BX24.callMethod` para criar uma Smart Invoice:

```text
BX24.callMethod("crm.item.add", {
  entityTypeId: 31,
  fields: {
    title: "Parcela 1/6 - Nome do Negócio",
    opportunity: 100.00,
    currencyId: "EUR",
    isManualOpportunity: "Y",
    contactId: <contactId do deal>,
    parentId2: <dealId>,           // Vincula ao Deal
    begindate: "2026-03-01",       // Data de emissão
    closedate: "2026-04-01",       // Data de vencimento
    comments: "Fatura gerada automaticamente pelo Emmely Pay. Parcela 1/6."
  }
});
```

O ID da Smart Invoice retornado será persistido nos metadados da transação via uma chamada de atualização.

### 2. Atualizar metadados da transação com o ID da Invoice

Após criar a Smart Invoice no Bitrix24, o frontend chamará um endpoint para atualizar os metadados da transação (`payment_transactions.metadata`) com o `bitrix_invoice_id`, permitindo que o webhook saiba qual fatura atualizar quando o pagamento for confirmado.

Para isso, será necessário um novo endpoint simples ou uma atualização na Edge Function `payment-create` para aceitar atualizações de metadados.

### 3. Webhook marca a Invoice como paga (`payment-webhook-asaas/index.ts` e `payment-webhook-stripe/index.ts`)

Quando o pagamento é confirmado via webhook:

1. O webhook já busca a transação e os metadados
2. Se `metadata.bitrix_invoice_id` existir, chamar a API Bitrix24:
   - `crm.item.update` com `entityTypeId: 31` para mover a fatura para o estágio "Paga"
   - Ou usar `crm.item.payment.pay` se quiser usar o sistema nativo de pagamentos da invoice
3. Adicionar comentário na timeline da Invoice

### 4. Exibição no painel Emmely Pay

Ao renderizar os cards de parcelas, se `bitrix_invoice_id` estiver nos metadados, mostrar um link direto para abrir a Invoice no Bitrix24.

## Detalhes Técnicos

### Ficheiros alterados

1. **`supabase/functions/bitrix24-payment-tab/index.ts`**
   - JavaScript: após cada `payment-create`, chamar `BX24.callMethod("crm.item.add", { entityTypeId: 31, ... })`
   - Passar `contactId` e `dealId` do contexto do Deal para vincular as Invoices
   - Atualizar os metadados da transação com o `bitrix_invoice_id` retornado
   - Nos cards de parcelas, mostrar link para abrir a Invoice no Bitrix24 se disponível

2. **`supabase/functions/payment-create/index.ts`**
   - Adicionar rota/lógica para atualizar metadados de uma transação existente (PATCH), ou criar um endpoint separado para isso

3. **`supabase/functions/payment-webhook-asaas/index.ts`**
   - Na função `notifyBitrix24DealPayment`, verificar `metadata.bitrix_invoice_id`
   - Chamar `crm.item.update` com `entityTypeId: 31` para mover o estágio da Invoice para "Paga"
   - Adicionar timeline comment na Invoice

4. **`supabase/functions/payment-webhook-stripe/index.ts`**
   - Mesma lógica do webhook Asaas: atualizar a Invoice para "Paga" quando o pagamento for confirmado

### API Bitrix24 utilizada

```text
Criar Invoice:
  crm.item.add { entityTypeId: 31, fields: { title, opportunity, currencyId, isManualOpportunity: "Y", contactId, parentId2: dealId, begindate, closedate, comments } }

Atualizar Invoice (marcar como paga):
  crm.item.update { entityTypeId: 31, id: invoiceId, fields: { stageId: "<estágio de paga>" } }

Obter estágios disponíveis (uma vez, para saber qual é o estágio "Paga"):
  crm.status.list { filter: { ENTITY_ID: "SMART_INVOICE_STAGE_<categoryId>" } }
```

### Fluxo completo atualizado

```text
1. Utilizador preenche: Total=1000, Entrada=500, Parcelas=5, Intervalo=30d
2. Frontend calcula: Entrada (500) + 5x de 100
3. Para cada parcela:
   a. Chama payment-create -> cria transação + cobrança no gateway
   b. Chama BX24.callMethod("crm.item.add") -> cria Smart Invoice no Bitrix24
   c. Atualiza metadata da transação com bitrix_invoice_id
4. Painel mostra 6 cards com link para cada Invoice
5. Cliente paga -> webhook confirma -> atualiza transação + move Invoice para "Paga"
```

### Considerações

- O estágio de "Paga" pode variar entre portais Bitrix24 (cada portal pode ter funis/estágios customizados). O webhook precisará buscar os estágios disponíveis via `crm.status.list` ou usar um estágio fixo como fallback
- A vinculação Deal-Invoice é feita via `parentId2` (Deal é entityTypeId 2)
- O `contactId` do Deal é reutilizado para vincular a Invoice ao mesmo contacto

## Resumo de Impacto

- Cada parcela gera uma Smart Invoice nativa no Bitrix24, visível no CRM
- Invoices ficam vinculadas ao Deal e ao Contacto automaticamente
- Webhook de pagamento marca a Invoice como paga automaticamente
- Sem novas tabelas no banco de dados (usa o campo `metadata` existente)
- Links diretos para Invoices nos cards do painel Emmely Pay

