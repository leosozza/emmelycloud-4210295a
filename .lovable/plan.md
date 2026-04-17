
## Pergunta do utilizador

> "Considera que cada parcela é praticamente uma fatura (invoice)?"

Sim. No teu sistema cada parcela **já é** materializada como Smart Invoice no Bitrix24 (`crm.item.add` com `entityTypeId: 31`), conforme se vê em `bitrix24-payment-webhook` (linhas que criam a fatura por parcela e gravam `bitrix24_invoice_id` em `financial_records`).

O que falta hoje:

1. **Status sync** — quando a parcela muda de `pendente`→`paga` (ou vice-versa), a Smart Invoice no Bitrix24 não recebe a atualização de stage. O cliente vê o pagamento confirmado no Stripe mas a fatura no CRM continua "Em aberto".
2. **Eventos inbound** — se alguém marcar a Smart Invoice como paga manualmente no Bitrix24, isso não reflete no `financial_records`.
3. **Parcelas sintéticas** — quando uma parcela é gerada on-the-fly do `payment-receipt` ela não tem ainda `bitrix24_invoice_id`. Só ganha um ao ser materializada via `payment-create-link`. Hoje o `payment-create-link` cria o `financial_record` mas **não cria a Smart Invoice correspondente** — isso só acontece no fluxo do `bitrix24-payment-webhook`.

Os links que enviaste (`crm.invoice.status.update` + eventos `OnCrmInvoiceUpdate`) são da **API antiga (legacy invoices)**. O sistema usa **Smart Invoices** (entityTypeId 31), portanto:
- Status update → `crm.item.update` com `stageId`
- Eventos → `OnCrmDynamicItemUpdate` filtrado por `entityTypeId=31` (não os eventos legacy)

## Plano

### 1. Materializar Smart Invoice no `payment-create-link`
Quando uma parcela sintética é materializada, criar imediatamente a Smart Invoice no Bitrix24 (mesma lógica que está em `bitrix24-payment-webhook`) e gravar o `bitrix24_invoice_id` em `financial_records`. Assim cada parcela = 1 fatura real no CRM desde o primeiro clique.

### 2. Sync outbound de status (parcela → Smart Invoice)
- Trigger DB em `financial_records`: quando `status` muda, chama uma nova edge function `bitrix24-sync-invoice-status` (via `pg_net`) passando `bitrix24_invoice_id` e novo status.
- A função traduz: `pendente`→stage "DT31_X:NEW", `paga`→"DT31_X:P" (Paid), `cancelada`→"DT31_X:D" (Declined). Os IDs reais dos stages são lidos por `crm.item.fields(entityTypeId=31)` na primeira execução e cacheados em `bitrix24_integrations.config.smart_invoice_stages`.
- Chama `crm.item.update` com `entityTypeId: 31, id: invoice_id, fields: { stageId }`.

### 3. Sync inbound (Smart Invoice → parcela)
- Registar o evento `OnCrmDynamicItemUpdate` (filtrado por `entityTypeId=31`) durante o `bitrix24-install` ou via `bitrix24-rebind-events`.
- Reusar `bitrix24-events` (ou criar `bitrix24-invoice-events`) para receber o evento, ler o `stageId` atual, mapear para `paga/pendente/cancelada` e fazer `UPDATE financial_records SET status = ... WHERE bitrix24_invoice_id = ...`.
- Anti-loop: marcar a transição com flag em `payment_transactions.metadata.sync_origin = 'bitrix24'` para o trigger outbound não reenviar.

### 4. Update de Deal continua igual
A escrita em `UF_CRM_EMMELY_PAYMENT_STATUS` no Deal continua a refletir o estado agregado (todas pagas → "Pago", parcial → "Parcial", nenhuma → "Pendente"). Atualizar a função a contar parcelas reais e sintéticas.

### 5. UX de erros (já feito anteriormente)
Manter o modal de campos em falta. Acrescentar um aviso quando a Smart Invoice falha a ser criada (não bloqueia o pagamento, só informa que a fatura no CRM precisa ser criada manualmente).

## Detalhes técnicos

- API: `crm.item.update` (não `crm.invoice.update` — esse é legacy).
- Endpoint do evento: `crm.item.event.list` para descobrir, mas o registo é via `event.bind` com `event = "OnCrmDynamicItemUpdate"` e filtro `entityTypeId=31` no handler.
- Smart Invoice stages (PT padrão): `DT31_1:NEW` (Rascunho), `DT31_1:P` (Pago), `DT31_1:D` (Recusado). O `1` é o `categoryId` por defeito; pode variar — daí o cache.
- Migração: criar trigger `on_financial_status_change` em `financial_records` que dispara quando `OLD.status IS DISTINCT FROM NEW.status AND NEW.bitrix24_invoice_id IS NOT NULL`.
- Idempotência: `bitrix24-sync-invoice-status` lê o stage atual antes de update e só escreve se diferente.

## Resultado esperado

- Cada parcela existe como Smart Invoice real no Bitrix24 desde a sua criação (sintética ou não).
- Pagamento no Stripe → status "Pago" no CRM em <2s.
- Marcar fatura como paga no CRM → parcela atualizada no Emmely sem loop.
- Reconciliação dual-direction completa entre `financial_records` ↔ Smart Invoice.
