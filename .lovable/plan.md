
## Objetivo

No robot Emmely Pay (Criar Cobrança), hoje há dois campos que disparam um **Flow** interno:
- **Flow ao Confirmar Pagamento** — quando o pagamento é confirmado.
- **Flow ao Atrasar Pagamento** — quando passa X dias da data de vencimento.

O utilizador quer, para cada um destes eventos, poder escolher **uma de duas ações** (ou ambas):
1. Executar um Flow interno do Emmely (comportamento atual).
2. Mudar a **etapa (stageId)** do Deal no Bitrix24.

## Alterações

### 1. Robot Bitrix24 — parâmetros novos
Em `supabase/functions/bitrix24-install/index.ts` (definição do robot "Criar Cobrança"), adicionar 4 parâmetros novos:

- `stage_on_paid` — dropdown (enum) com as etapas do funil do Deal. Rótulo: **"Etapa ao Confirmar Pagamento"**.
- `stage_on_overdue` — dropdown com as etapas do funil. Rótulo: **"Etapa ao Atrasar Pagamento"**.
- (opcional) `category_id` — para saber de qual funil listar as etapas; se vazio, usa o funil do próprio Deal em runtime.

Como o Bitrix não permite popular dinamicamente o dropdown do robot com stages por pipeline sem hardcode, a lista será preenchida na hora do install lendo `crm.dealcategory.stage.list` para cada categoria e concatenando (`C0:NEW`, `C1:PREPAYMENT_INVOICE`, etc.), com rótulo "[Funil] Nome da Etapa". Fallback: campo string livre onde o utilizador cola o `STAGE_ID`.

### 2. Handler do robot
Em `supabase/functions/bitrix24-robot-handler/index.ts`, ao processar as propriedades recebidas, gravar os novos campos junto ao registo financeiro / transação (novas colunas em `financial_records` ou dentro de `metadata` JSON):
- `stage_on_paid`
- `stage_on_overdue`
- `flow_on_paid` (já existe)
- `flow_on_overdue` (já existe)

Não é preciso migração se guardarmos em `metadata` JSON (preferido, sem alterar schema).

### 3. Disparo no evento "Pagamento Confirmado"
Em `supabase/functions/payment-webhook-stripe/index.ts` (e no equivalente Asaas), depois de marcar como pago:
- Se `metadata.flow_on_paid` estiver definido → dispara o flow (comportamento atual).
- Se `metadata.stage_on_paid` estiver definido → chama `crm.deal.update` com `STAGE_ID` = valor guardado.
- Ambos podem coexistir; executam-se em paralelo.

### 4. Disparo no evento "Atraso de Pagamento"
No CRON `payment-reminder` (ou função equivalente que detecta atraso após X dias):
- Se `metadata.flow_on_overdue` → dispara flow.
- Se `metadata.stage_on_overdue` → move a etapa do Deal via `crm.deal.update`.

### 5. Reinstalação
Utilizador precisa reautorizar/reinstalar a app Bitrix24 para os novos campos do robot aparecerem (`handler.add` só recria propriedades na (re)instalação).

## Detalhes técnicos

- Chamada Bitrix para mover etapa: `crm.deal.update` com `fields: { STAGE_ID: "C1:NEW" }` (usar `client_endpoint` + token válido, mesma helper `ensureValidToken` já existente em `bitrix24-sync-invoice-status`).
- Guardar as escolhas no `metadata` da `financial_records` (ou `transactions`) já criadas pelo robot, para que os webhooks consigam recuperar sem consultar novamente o Bitrix.
- Registar tudo em `bitrix24_debug_logs` (`event_type: "stage_change_on_paid" | "stage_change_on_overdue"`) para auditoria.

## Fora de escopo

- Não alterar o layout do iframe Emmely Pay.
- Não alterar o comportamento dos flows já existentes; apenas adicionar a ação de mudar etapa em paralelo.
