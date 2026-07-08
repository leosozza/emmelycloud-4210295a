# Limpeza do Deal 47047 — remover faturas duplicadas + colocar entrada em "Paga"

## Situação atual

No Bitrix aparecem 8 Smart Invoices para o Deal 47047 (10661, 10663, 10665, 10667, 10669, 10671, 10673, 10677) porque o robot foi disparado várias vezes durante os testes — cada disparo gerou um grupo novo de parcelas + faturas. Só o grupo `03185792-…` corresponde ao pagamento real (tx `9c80b918` confirmada + tx `78ec60f6` pendente).

A fatura 10677 (entrada) ficou marcada como "New" no UI apesar do `bitrix24-sync-invoice-status` ter respondido `new_stage: DT31_1:P`. Isto significa que o mapeamento de estágios usado por essa edge function não bate certo com o pipeline real da Smart Invoice deste portal — o `P` que ela escolhe não é o "Paga" visível na barra.

## Plano

### 1. Diagnóstico rápido dos estágios reais

Chamar `crm.item.stages` (ou `crm.status.list` para `SMART_INVOICE_STAGE_<categoryId>`) via um script `psql`/edge para listar todos os estágios do pipeline de Smart Invoices e identificar o `STATUS_ID` correto do estágio "Paga" — provavelmente algo tipo `DT31_10:P` ou `DT31_10:S` (não `DT31_1:P`, que a UI está a mostrar como "New").

Corrigir depois `bitrix24-sync-invoice-status` para escolher o estágio "Paga" real (por `SEMANTICS = 'S'` — success — em vez de assumir o primeiro `:P`).

### 2. Cancelar as Smart Invoices duplicadas

Para cada tx pendente do Deal 47047 sem pagamento real (todas as tx do Deal 47047 exceto a `9c80b918` confirmada e a `78ec60f6` que agora está ligada ao FR da parcela), buscar o `bitrix_invoice_id` associado à mesma "corrida" do robot e:

- Chamar `crm.item.update` (entityTypeId=31) para mover a Smart Invoice para o estágio "Cancelada"/"Rejeitada" (identificar `STATUS_ID` correspondente no passo 1) — ou `crm.item.delete` se o utilizador preferir apagar em vez de cancelar.
- Marcar as `payment_transactions` duplicadas como `status='cancelled'` para não voltarem a poluir a aba Emmely Pay.

Como as txs duplicadas (`3e5f8f9c`, `c825806b`, `d5df2f83`, `6aa9441e`, `936893a8`) não têm `bitrix_invoice_id` na metadata, vamos correlacionar pela ordem de criação com as invoices 10661/10663/10665/10667/10669/10671/10673 (todas anteriores a 10677) — confirmando via `crm.item.list` com `parentId2=47047` e o campo `UF_CRM_69B83DDB2661E` (group_id) para ligar cada invoice ao respetivo grupo de tx.

### 3. Voltar a sincronizar a fatura 10677 para "Paga"

Depois de descoberto o `STATUS_ID` de "Paga" no passo 1, chamar `crm.item.update` diretamente em 10677 para o estágio correto (ou re-invocar `bitrix24-sync-invoice-status` já corrigido).

### 4. Confirmar Deal na aba Emmely Pay

Refrescar o Deal 47047 → deve mostrar exatamente 2 faturas na lista do Bitrix (Entrada 10677 "Paga" + a nova Parcela pendente que vai ser criada apenas quando decidirmos gerar a Smart Invoice para o FR da parcela).

### 5. (Opcional — pedir confirmação)

O FR criado para a 2ª parcela ainda não tem `bitrix24_invoice_id`. Confirmar se queres:
(a) que eu crie **uma** Smart Invoice nova no Bitrix para essa parcela (5 €, vence 06/09), ficando o total certinho no CRM; ou
(b) manter só no Emmely Pay (que já mostra o link de pagamento).

## Ficheiros a alterar

- `supabase/functions/bitrix24-sync-invoice-status/index.ts` — passar a resolver o estágio "Paga" via `SEMANTICS='S'` em vez de match textual.

## Ações one-off (fora do código)

- `crm.item.update` para cada Smart Invoice duplicada (mover para "Cancelada"/"Rejeitada" ou apagar).
- `UPDATE payment_transactions SET status='cancelled' WHERE id IN (…5 ids…)`.
- `crm.item.update` para 10677 → estágio "Paga" real.

Aguardo confirmação do ponto 5 (criar ou não a Smart Invoice para a 2ª parcela) e se prefere **cancelar** ou **apagar** as faturas duplicadas no Bitrix.
