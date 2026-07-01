## Problema

Ao abrir o Emmely Pay, a parcela aparece "pronta" (com valor 100,00 €) mas ainda **não foi gerada no Stripe** (é um registo sintético a partir dos UF do Deal). O utilizador confunde-se e pensa que já foi criada. Além disso, hoje se faltar Vencimento/Método, tem de sair do iframe, editar o Deal no Bitrix e voltar.

## O que muda

### 1. Selo visual "Ainda não gerada" na frente da parcela
No card da parcela em `supabase/functions/bitrix24-payment-tab/index.ts` (render de `b24-item`, ~linha 273–305):

- Detetar parcelas sintéticas (sem `transaction_id` real, ou seja `inst.financial_record_id` ausente **ou** `inst.id.startsWith("synthetic")`).
- Adicionar badge amarelo destacado ao lado de "Parcela 1/1", com texto **"Não gerada"** + ícone `file-plus`.
- Substituir/realçar o botão de ação para **"Gerar cobrança"** (primário azul) em vez do actual "Link" quando ainda não gerada. Ao clicar, abre o mesmo modal de edição já pré-preenchido — o Guardar cria a transação real (via `ensureTxExists` que já existe) e o link Stripe passa a ficar disponível.
- Quando `hasMissing` (Vencimento ou Método por definir), o botão "Gerar cobrança" fica **desativado** com tooltip "Preencha Vencimento e Método primeiro".

### 2. Preencher Vencimento/Método direto no iframe (sync para Bitrix)
Hoje o modal Editar (`submitEdit`, ~linha 1622) grava em `financial_records` + Smart Invoice 31, mas **não** volta a escrever nos campos UF do Deal/Lead/SPA — por isso ao reabrir, o Emmely Pay volta a mostrar "Definir".

Alterações:

- Em `submitEdit` (client-side dentro do HTML da edge function), após o PATCH de `payment-create`, invocar `bitrix24-update-deal-payment` com o `entity_type`, `deal_id` e `payment_data` contendo apenas os campos alterados:
  - `next_due_date` ← `edit-due-date`
  - `payment_method` ← `edit-method`
  - `installment_value` ← `edit-amount` (quando o utilizador ajustar valor)
- Passar `member_id` (já disponível no HTML como `MEMBER_ID`) e `spa_entity_type_id` quando `entity_type === "spa"`.
- No `bitrix24-update-deal-payment/index.ts`, garantir que quando só chegam `next_due_date`/`payment_method` (sem `total_installments`), o bloco que recria Smart Invoices (~linha 130) é **saltado** — só atualiza os UF do entity. Adicionar guarda: `if (total_installments === undefined) skip invoice loop`.

Resultado: ao Guardar no modal do iframe, os campos ficam persistidos em três lugares consistentes — `financial_records`, Smart Invoice 31, e UF do Deal — sem sair do Bitrix.

### 3. Pequeno ajuste no render após guardar
- Manter o `location.reload()` que já existe após 1,5 s (linha ~1655) para refletir imediatamente o estado "gerada" no card.

## Fora do âmbito
- Não altera o layout dos 3 cards KPI (Total/Pago/Em Aberto).
- Não mexe no modal "Criar Cobrança" completo (só no fluxo por parcela existente).
- Não muda regras de late-fee nem de baixa.

## Ficheiros afetados
- `supabase/functions/bitrix24-payment-tab/index.ts` — badge "Não gerada", botão "Gerar cobrança", chamada extra em `submitEdit` para `bitrix24-update-deal-payment`.
- `supabase/functions/bitrix24-update-deal-payment/index.ts` — saltar recriação de Smart Invoices quando só se atualizam campos parciais (due_date/method).
