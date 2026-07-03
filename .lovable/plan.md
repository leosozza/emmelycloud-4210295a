## Contexto

O robot `emmely_create_charge` já cria **1 Smart Invoice (type 31) por parcela** e vincula ao deal via `parentId2`, mas:

1. **Link por parcela não é escrito na fatura** — só a 1ª (entrada) fica no campo do deal `UF_CRM_EMMELY_PAYMENT_URL`. As outras parcelas ficam sem link visível.
2. **Reenvio duplica** — cancelamos parcelas em `payment_transactions`, mas as faturas antigas no Bitrix continuam ativas; ao criar novas, aparecem 5 + 5 = 10.
3. **Cancelamento** — não existe. Precisa ser possível manualmente (deal ou fatura) e via robot **acionado na fatura**.

## Solução

### A. Campos UF na Smart Invoice (type 31)

No `bitrix24-install/index.ts`, além dos campos em Deal/Lead, registar em `entityId="CRM_31"` (via `userfieldconfig.add`):

- `UF_CRM_SMART_INVOICE_EMMELY_PAYMENT_URL` (url) — link Stripe daquela parcela.
- `UF_CRM_SMART_INVOICE_EMMELY_PAYMENT_STATUS` (enum: Pendente/Pago/Cancelado).
- `UF_CRM_SMART_INVOICE_EMMELY_RECEIPT_URL` (url) — comprovativo após pago.
- `UF_CRM_SMART_INVOICE_EMMELY_TX_ID` (string) — id do `payment_transactions` (fonte da verdade para o cancel-robot).
- `UF_CRM_SMART_INVOICE_EMMELY_GATEWAY` (string).

Correr no install existente e adicionar `postInstall` idempotente para portais já ligados.

### B. Escrever link em cada fatura ao criar

Em `handleCreateCharge` (robot-handler), no bloco `crm.item.add entityTypeId:31`, incluir no `fields`:

```
UF_CRM_SMART_INVOICE_EMMELY_PAYMENT_URL: tx.payment_url,
UF_CRM_SMART_INVOICE_EMMELY_PAYMENT_STATUS: <id "Pendente">,
UF_CRM_SMART_INVOICE_EMMELY_GATEWAY: tx.gateway,
UF_CRM_SMART_INVOICE_EMMELY_TX_ID: tx.id,
```

E, quando o `payment-webhook-stripe` marca `paid`, escrever no invoice o `_PAYMENT_STATUS = Pago` + `_RECEIPT_URL`. (Estender o handler existente do webhook; ele já sabe encontrar o deal → agora encontra também o `bitrix_old_invoice_id` a partir da `payment_transactions.metadata`.)

O deal continua a receber **apenas** a URL da 1ª parcela (entrada) em `UF_CRM_EMMELY_PAYMENT_URL` — comportamento atual mantido.

### C. Evitar duplicação no reenvio (recreate)

Antes de re-criar (dentro do branch `recreate` já existente):

1. Ler `metadata.bitrix_old_invoice_id` de cada `payment_transactions` cancelada.
2. Batch `crm.item.update entityTypeId:31` movendo cada fatura para **estágio Cancelada** (`stageId: "DT31_3:D"`; se o portal não tiver esse ID, fallback `crm.item.delete`) e definir `UF_CRM_SMART_INVOICE_EMMELY_PAYMENT_STATUS = "Cancelado"`.
3. Só depois criar as novas faturas.

Log em `bitrix24_debug_logs` (`event_type: invoice_cancel_before_recreate`).

### D. Cancelamento manual (iframe)

**Deal view** — botão "Cancelar cobrança" (nova função `payment-cancel`, POST `{ deal_id, member_id, reason, source:"iframe" }`) que cancela o **grupo pendente inteiro** (usa mesma lógica do C).

**Invoice view (entity 31)** — botão "Cancelar esta parcela" cancela apenas a fatura + a `payment_transactions` correspondente:
- POST `payment-cancel { invoice_id, tx_id (do UF), reason, source:"iframe" }`.
- Atualiza tx: `status='cancelled'`.
- Best-effort Stripe expire.
- Update fatura: `stageId = DT31_3:D`, `UF_..._PAYMENT_STATUS = Cancelado`.
- Se **todas** as parcelas do grupo ficarem canceladas → limpa também `UF_CRM_EMMELY_PAYMENT_URL` do deal.
- Timeline no deal-pai: `🚫 Parcela X/Y cancelada`.

Guard: bloquear se a tx já for `paid/succeeded/confirmed`.

### E. Robot na fatura: `emmely_cancel_charge`

Registar via `bizproc.robot.add` com **DOCUMENT_TYPE = ["crm","CCrmDocumentInvoice","SMART_INVOICE"]** (`entityTypeId: 31`).

Propriedades:
- `invoice_id` (obrigatório; auto = document ID)
- `reason` (opcional)

Handler `handleCancelInvoice(properties, integration, supabase)`:
1. Ler `invoice_id`.
2. `crm.item.get entityTypeId:31 id:invoice_id` → obter `UF_CRM_SMART_INVOICE_EMMELY_TX_ID` e `parentId2` (deal_id).
3. Chamar internamente `payment-cancel { tx_id, invoice_id, deal_id, reason, source:"robot" }`.
4. Devolver `cancel_status`, `error`.

Novo `case` no switch do robot-handler: `"emmely_cancel_charge"` / `"cancel_charge_invoice"`.

### F. Nova edge function `payment-cancel`

Contrato único (aceita **um** dos três modos):

```
POST /functions/v1/payment-cancel
{ mode: "deal"|"invoice"|"tx",
  deal_id?, invoice_id?, tx_id?,
  member_id?, reason?, source: "iframe"|"robot" }
```

Fluxo comum:
- Resolver `integration` (member_id → fallback).
- Resolver alvo:
  - `mode=deal` → todas parcelas pending do último grupo do deal.
  - `mode=invoice` → tx via `UF_CRM_SMART_INVOICE_EMMELY_TX_ID` da fatura.
  - `mode=tx` → tx directa.
- Guard: se qualquer alvo já pago → `blocked`.
- `UPDATE payment_transactions SET status='cancelled', metadata=metadata||{cancelled_at,cancel_reason,source}`.
- Best-effort `stripe.checkout.sessions.expire` (helper já existente).
- Best-effort atualizar faturas Bitrix (stage cancelada + UF status).
- Se o grupo inteiro ficar cancelado, limpar `UF_CRM_EMMELY_PAYMENT_URL` e `UF_CRM_EMMELY_GATEWAY` do deal.
- Timeline no deal com origem (iframe/robot) e contagem.
- Log `bitrix24_debug_logs` (`event_type: charge_cancelled`).
- Resposta: `{ status, cancelled_count, invoices_cancelled, stripe_expired, deal_url_cleared }`.

### G. Ajustes no `bitrix24-payment-webhook`/`payment-webhook-stripe`

Ignorar eventos `checkout.session.expired` quando a tx local já estiver `cancelled` (evita reescrever status).

## Instalação nos portais existentes

Endpoint auxiliar `bitrix24-install-emmely-invoice-fields` (idempotente) para registar os novos UFs da fatura sem correr o install completo. Chamado uma vez por portal já ligado.

## Validação

1. Deal com 5 parcelas → cria 5 faturas, cada uma com o **seu** link no UF, deal continua com URL da entrada.
2. Reenviar sem mudanças → `♻️ reutilizado`, 5 faturas continuam iguais (sem duplicação).
3. Reenviar com valor alterado → 5 faturas antigas passam a estágio Cancelada, 5 novas criadas.
4. Iframe: "Cancelar cobrança" no deal → 5 tx `cancelled`, 5 faturas em Cancelada, deal URL limpo.
5. Iframe: "Cancelar esta parcela" em 1 fatura → só essa tx/fatura cancelada, deal URL preservado se restarem parcelas pending.
6. Robot na fatura (mover para estágio "Cancelado") → mesmo efeito da parcela individual.
7. Tentar cancelar fatura já paga → `blocked` + timeline `⚠️ já pago`.

## Fora de escopo

- Estorno (refund) de parcelas já pagas — fluxo à parte.
- Alterar comportamento do link no deal (continua a ser só a 1ª parcela).
