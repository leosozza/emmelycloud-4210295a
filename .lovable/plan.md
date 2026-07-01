## Objetivo
Quando o utilizador clica em **Editar** (ou nos avisos "Definir" de Vencimento/Método) em uma parcela existente, abrir o **mesmo modal completo da "Criar Cobrança"** — pré-preenchido com os dados atuais da parcela — para que ele possa completar todos os campos em falta (Vencimento, Método, Notas, Currency, etc.) e escolher a forma de pagamento no mesmo fluxo.

## Alterações em `supabase/functions/bitrix24-payment-tab/index.ts`

### 1. Reutilizar o modal `#pay-overlay` para edição
- Adicionar campo oculto `#pay-edit-tx-id` (+ `#pay-edit-invoice-id`, `#pay-edit-original-value`) dentro de `#pay-overlay`.
- Novo estado `_editMode` em JS: quando ativo, o título muda para "Editar Cobrança" e o botão principal para "Guardar Alterações".

### 2. Nova função `openEditFullModal(inst)`
Substitui a atual `openEditModal(inst)` como handler dos botões/links "Editar", "Definir Vencimento" e "Definir Método":
- Chama `openCreateForm()` para renderizar o modal.
- Após aberto, preenche:
  - `#pay-amount` = `inst.value` (bloqueado para edição de uma parcela: NÃO aciona recálculo de entrada/parcelas — trata como valor único).
  - `#pay-currency` = `inst.currency`.
  - `#pay-due-date` = `inst.due_date`.
  - `#pay-method` = `inst.payment_method || 'card'` e chama `toggleMethodFields()` para exibir os campos do gateway correto (Stripe, PIX, Boleto, MB Way, Multibanco, Recebimento Direto).
  - `#pay-notes` = `inst.notes`.
  - Esconde a seção de parcelamento/entrada (bloco de Entrada + Saldo + Nº Parcelas) porque estamos editando **uma parcela específica**, não a cobrança inteira.
- Define `_editMode = { txId, invoiceId, originalValue }`.

### 3. Ajustar `submitInstallments()`
No início da função, se `_editMode` estiver definido:
- Bifurca para uma nova função `submitEditFull()` que:
  - Chama `ensureTxExists()` (sintética → real) igual à atual `submitEdit`.
  - Faz `PATCH /payment-create` com `amount_update`, `due_date_update`, `payment_method_update`, `notes`, mais os novos campos que o modal completo permite (ex.: `currency_update` se aplicável).
  - Atualiza Smart Invoice no Bitrix (`crm.item.update` entityTypeId 31) com `opportunity`, `closedate`, `currencyId`.
  - Chama `bitrix24-update-deal-payment` com `payment_data` sincronizando `installment_value`, `next_due_date`, `payment_method`, `currency`.
  - Fecha modal e recarrega.

### 4. Remover / manter compatibilidade
- Manter `#edit-overlay` no HTML mas deixar de referenciá-lo (código morto pode ficar por ora para não quebrar `openBaixaModal` que usa `ensureTxExists` compartilhado).
- Trocar todos os `onclick='openEditModal(${instJson})'` em linhas 279, 298, 302, 314 por `openEditFullModal(${instJson})`.

### 5. UX no modal em modo edição
- Título muda para "Editar Cobrança — Parcela N/M".
- Botão "Cancelar" continua fechando; "Guardar Alterações" substitui "Criar Cobrança".
- Bloco de parcelamento (Entrada / Nº Parcelas / Saldo) e "Auto-preencher do Negócio" ficam **escondidos**, pois estamos editando uma parcela única. O bloco de método de pagamento com todos os campos (Stripe / PIX / Boleto / MB Way / Multibanco / Direto) fica **visível e editável**.
- Ao trocar `#pay-method`, `toggleMethodFields()` já mostra/oculta os campos específicos do gateway — reutilizado sem alterações.

## Fora de escopo
- Alterações no fluxo de "Criar Cobrança" novo (continua igual).
- Modal de Baixa.
- Backend `payment-create` (o endpoint PATCH já aceita os campos necessários).

## Arquivos
- `supabase/functions/bitrix24-payment-tab/index.ts` (único arquivo).
- Redeploy da edge function após aplicar.
