

## Revisão do Fluxo de Pagamento via Robots Bitrix24

### Entendimento Corrigido

O fluxo de pagamento **não** é via webhook externo. É accionado pelo **Robot `emmely_create_charge`** que já existe no `bitrix24-robot-handler`. O robot recebe os dados de pagamento directamente do BizProc do Bitrix24. Para cada parcela, deve criar uma **Invoice (old API)** via `crm.invoice.add` no Bitrix24.

### O que Mudar

---

#### 1. Refactorizar `handleCreateCharge` no robot-handler para suportar parcelamento

**Ficheiro:** `supabase/functions/bitrix24-robot-handler/index.ts`

O `handleCreateCharge` actual (linhas 181-233) cria apenas **uma** cobrança simples. Precisa suportar:

- **Novos parâmetros do robot:**
  - `installments` / `INSTALLMENTS` — número de parcelas (default 1)
  - `first_due_date` / `FIRST_DUE_DATE` — data do 1º vencimento
  - `down_payment` / `DOWN_PAYMENT` — valor de entrada (default 0)
  - `deal_id` / `DEAL_ID` — ID do negócio para vincular faturas
  - `contact_id` / `CONTACT_ID` — ID do contacto

- **Lógica de parcelamento:**
  1. Calcular parcelas (entrada + N parcelas mensais de 30 em 30 dias)
  2. Para cada parcela, chamar `payment-create` (como já faz)
  3. Para cada parcela, chamar `crm.invoice.add` (API old) no Bitrix24 com:
     - `ORDER_TOPIC`: "Parcela X/N - Descrição"
     - `STATUS_ID`: "N" (novo/pendente)
     - `DATE_PAY_BEFORE`: data de vencimento da parcela
     - `UF_DEAL_ID`: deal_id recebido
     - `UF_CONTACT_ID`: contact_id recebido
     - `PRODUCT_ROWS`: item único com o valor da parcela
  4. Retornar valores ao BizProc: `charge_id`, `charge_status`, `invoices_created`, `gateway_used`

- **Precisa do `memberId`** e da integração para chamar a API do Bitrix24. O handler principal já tem acesso a isso (linhas 589-615), mas `handleCreateCharge` actualmente não recebe esses dados. Refactorizar para passar a integração.

---

#### 2. Actualizar registos dos robots no Bitrix24

O robot `emmely_create_charge` precisa registar os novos campos de entrada (installments, first_due_date, down_payment, deal_id, contact_id) e de saída (invoices_created). Isto é feito no `bitrix24-install` ou `bitrix24-reregister-bot`.

**Ficheiro:** `supabase/functions/bitrix24-reregister-bot/index.ts` — adicionar propriedades do robot.

---

#### 3. Payment Tab — melhorias no controlo pago/aberto

**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

O tab já tem:
- KPIs (Total / Pago / Em Aberto) com barra de progresso
- Botão "Dar Baixa" que actualiza status para `confirmed`
- Sincronização com Smart Invoices (entityTypeId 31)

Alterações necessárias:
- Na função `markAsPaid`, além de fechar Smart Invoices, também actualizar Invoices (old) via `crm.invoice.update` com `STATUS_ID: "P"` (paga)
- Guardar o `bitrix_old_invoice_id` na metadata da transacção (criado no passo 1)
- Exibir o link para a fatura old: `BX24.openPath('/crm/invoice/show/ID/')` em vez de `/crm/type/31/details/ID/`

---

#### 4. Remover/simplificar `bitrix24-payment-webhook`

O ficheiro `supabase/functions/bitrix24-payment-webhook/index.ts` criado anteriormente pode ser removido ou mantido como endpoint alternativo. A lógica principal passa a viver no robot handler.

---

### Ficheiros Afectados

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-robot-handler/index.ts` | Refactorizar `handleCreateCharge` para suportar parcelamento + criar Invoices (old API) |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Actualizar `markAsPaid` para fechar Invoice old; mostrar link correcto |
| `supabase/functions/bitrix24-reregister-bot/index.ts` | Registar novos campos do robot (installments, due_date, etc.) |

### Fluxo Resumido

```text
Bitrix24 BizProc → Robot "emmely_create_charge"
        │
        ├─ Dados enviados pelo robot:
        │   amount, installments, gateway, first_due_date,
        │   down_payment, deal_id, contact_id, currency
        │
        ▼
bitrix24-robot-handler (handleCreateCharge)
        │
        ├─ Calcula parcelas (entrada + N mensais)
        │
        ├─ Para cada parcela:
        │   ├─ POST /payment-create → transaction na DB
        │   └─ crm.invoice.add → fatura no Bitrix24
        │       (ORDER_TOPIC, STATUS_ID:"N", DATE_PAY_BEFORE,
        │        UF_DEAL_ID, UF_CONTACT_ID, PRODUCT_ROWS)
        │
        └─ bizproc.event.send → retorna resultados ao BizProc
            { charge_id, invoices_created, gateway_used }

Payment Tab (Placement CRM)
        │
        ├─ Busca transactions WHERE metadata.bitrix_deal_id = entityId
        ├─ Exibe: Parcela X/N | Valor | Vencimento | Status
        ├─ KPIs: Total | Pago | Em Aberto | % progresso
        │
        └─ "Dar Baixa" →
            ├─ PATCH /payment-create (status: confirmed)
            └─ crm.invoice.update (STATUS_ID: "P")
```

### Detalhes Técnicos: `crm.invoice.add`

Baseado na documentação oficial, cada fatura será criada com:
```javascript
crm.invoice.add({
  fields: {
    ORDER_TOPIC: "Parcela 1/5 - Nome do Negócio",
    STATUS_ID: "N",           // N = Novo/Pendente
    DATE_BILL: "2026-03-02",  // Data de emissão (hoje)
    DATE_PAY_BEFORE: "2026-04-02", // Vencimento
    UF_DEAL_ID: dealId,
    UF_CONTACT_ID: contactId,
    RESPONSIBLE_ID: 1,
    PERSON_TYPE_ID: 1,        // 1 = Pessoa Física
    PRODUCT_ROWS: [{
      PRODUCT_NAME: "Parcela 1/5",
      QUANTITY: 1,
      PRICE: 200.00
    }]
  }
})
```

Para dar baixa: `crm.invoice.update({ ID: invoiceId, fields: { STATUS_ID: "P" } })`

