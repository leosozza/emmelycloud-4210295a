# Deal 47047 — fix manual + causa raiz da parcela em falta

## Diagnóstico

Na base:
- **Cobrança criada pelo robot**: total 10 €, entrada 5 €, 1 parcela de 5 € → grupo `03185792-…` com 2 `payment_transactions`:
  - `9c80b918` (entrada, `is_down_payment=true`, `confirmed`, ligada ao FR `bc6fb932`, invoice Bitrix `10677`).
  - `78ec60f6` (parcela, `is_down_payment=false`, **`pending`**, sem `financial_record_id`, sem `bitrix_invoice_id`).
- Só existe **1 `financial_record`** para o deal (a entrada, `paga`). A parcela nunca gerou FR nem Smart Invoice no Bitrix.

Por isso o placement Emmely Pay mostra `TOTAL 5 €` (só lê FRs) em vez de 10 €, e o utilizador vê apenas a linha "Entrada".

**Causa raiz**: em `bitrix24-payment-webhook/index.ts` o loop chama `payment-create` para cada parcela e cria Smart Invoice para cada uma — mas o `payment-create` **não cria `financial_records` na criação**, só sincroniza no webhook de pagamento. Como a parcela nunca foi paga, nunca virou FR. Além disso, no bloco de Smart Invoice do webhook do robot, a criação da 2ª fatura falhou silenciosamente (ou nunca correu) — a tx `78ec60f6` ficou sem `bitrix_invoice_id`, sinal de que o `crm.item.add` para a parcela não retornou id ou lançou erro engolido pelo `try/catch`.

## Plano

### 1. Fix manual do Deal 47047 (via `supabase--insert` + chamadas edge)

- **Invoice 10677 (entrada)**: já está ligado ao FR `bc6fb932` (`paga`). Chamar `bitrix24-sync-invoice-status` para garantir que a Smart Invoice no Bitrix está no estágio "Paga" (se ainda não estiver).
- **Criar FR + Smart Invoice para a 2ª parcela**:
  - `INSERT` em `financial_records` com `total_value=5`, `installment_value=5`, `installment_number=2`, `total_installments=2`, `bitrix24_deal_id='47047'`, `status='pendente'`, `due_date` = data derivada do grupo original (30 dias após a entrada, conforme `interval_days`).
  - Chamar `crm.item.add` (entityTypeId=31) no Bitrix para criar a Smart Invoice da parcela, ligando ao deal 47047, com `UF_CRM_69B83DDB2661E = 03185792-…` (mesmo grupo) e URL de pagamento reutilizando a tx `78ec60f6` existente.
  - `UPDATE payment_transactions SET financial_record_id=<novo_fr>, metadata = metadata || jsonb_build_object('bitrix_invoice_id', <novo_invoice_id>) WHERE id='78ec60f6-…'`.
- **Deal**: manter no estágio atual (não avança para `stage_on_paid` porque só 50% foi pago). Confirmar que os UF do deal ficam consistentes: `UF_CRM_EMMELY_TOTAL_PAID=5`, `OPPORTUNITY=10`, `UF_CRM_EMMELY_PAYMENT_STATUS='Parcial'` — já está assim na screenshot.

### 2. Correção do código (para não repetir)

**`supabase/functions/bitrix24-payment-webhook/index.ts`** — no loop que cria parcelas (após ter a `tx` e o `invoiceId`):

- Inserir imediatamente um `financial_records` para **cada parcela** (entrada e parcelas), com `status='pendente'`, `bitrix24_deal_id`, `bitrix24_invoice_id`, `installment_number`, `total_installments`, `installment_value`, `total_value`, `due_date`. Guardar o `fr.id` retornado.
- Fazer `PATCH` na tx para preencher `financial_record_id` além do `bitrix_invoice_id` já propagado.
- Se `crm.item.add` falhar, registar em `bitrix24_debug_logs` com nível de erro (em vez de só `console.error`) e devolver a falha no array `errors` da resposta — para deixar de perder parcelas silenciosamente.

Com isto, o placement Emmely Pay passa a mostrar todas as parcelas (pagas e em aberto) desde o momento em que o robot corre, e o webhook de pagamento continua a marcar cada FR como `paga` normalmente (a lógica de match por `cs_…` já ficou correta na iteração anterior).

### 3. Validação

- Após o fix manual: refrescar a aba Emmely Pay do Deal 47047 → deve mostrar `TOTAL 10 €`, `PAGO 5 €`, `EM ABERTO 5 €`, com 2 linhas (Entrada paga + Parcela 2/2 pendente com link).
- Novo deal de teste com o robot (entrada + parcelas): logo após o robot correr, a aba deve mostrar todas as parcelas em `pendente` com links de pagamento — sem depender de nenhum pagamento acontecer primeiro.
