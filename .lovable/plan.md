# Adicionar 9 novos campos Emmely Pay ao Bitrix

## Campos a criar (no Deal e no Lead)

| FIELD_NAME | Tipo | Label |
|---|---|---|
| `UF_CRM_EMMELY_TOTAL_AMOUNT` | double | Valor Total da Cobrança |
| `UF_CRM_EMMELY_DOWN_PAYMENT` | double | Valor de Entrada |
| `UF_CRM_EMMELY_DOWN_INSTALLMENTS` | integer | Nº Parcelas da Entrada |
| `UF_CRM_EMMELY_DOWN_METHOD` | string | Método da Entrada |
| `UF_CRM_EMMELY_DOWN_FIRST_DUE` | date | 1º Vencimento da Entrada |
| `UF_CRM_EMMELY_DOWN_INTERVAL` | integer | Intervalo da Entrada (dias) |
| `UF_CRM_EMMELY_REMAINING_BALANCE` | double | Saldo a Parcelar |
| `UF_CRM_EMMELY_FIRST_DUE_DATE` | date | 1º Vencimento das Parcelas |
| `UF_CRM_EMMELY_INSTALLMENT_INTERVAL` | integer | Intervalo entre Parcelas (dias) |

## Mudanças

### 1. `supabase/functions/bitrix24-install/index.ts`
- Nas **duas** listas de definição de campos (install inicial ~linha 419–600 e action `repair_fields` ~linha 1390–1571), adicionar os 9 campos usando o mesmo padrão dos existentes (EDIT_FORM_LABEL PT/EN, LIST_COLUMN_LABEL, USER_TYPE_ID `double`/`integer`/`string`/`date`).
- Adicionar linhas correspondentes no seed de `bitrix24_field_mappings` (~linha 1638+) para aparecerem no FieldMappingManager (`supabase_table` = `financial_records` na maioria).

### 2. `supabase/functions/payment-create/index.ts`
Ao patchear o Deal via `crm.deal.update`, incluir os novos campos calculados a partir do payload da(s) parcela(s):
- `UF_CRM_EMMELY_TOTAL_AMOUNT` = soma total (entrada + saldo)
- `UF_CRM_EMMELY_DOWN_PAYMENT` = soma parcelas com `is_down_payment=true`
- `UF_CRM_EMMELY_DOWN_INSTALLMENTS` = contagem parcelas de entrada
- `UF_CRM_EMMELY_DOWN_METHOD` = método da primeira parcela de entrada
- `UF_CRM_EMMELY_DOWN_FIRST_DUE` = due_date mínimo entre parcelas de entrada
- `UF_CRM_EMMELY_DOWN_INTERVAL` = diferença em dias entre 1ª e 2ª parcela de entrada (ou 0)
- `UF_CRM_EMMELY_REMAINING_BALANCE` = total − entrada
- `UF_CRM_EMMELY_FIRST_DUE_DATE` = due_date mínimo das parcelas do saldo
- `UF_CRM_EMMELY_INSTALLMENT_INTERVAL` = diferença em dias entre 1ª e 2ª parcelas do saldo (ou 0)

### 3. `supabase/functions/bitrix24-payment-tab/index.ts`
- Em `submitInstallments()`, incluir estes 9 valores no body enviado à `payment-create` (como `deal_fields_extra`), para que o backend consiga popular o Deal sem recalcular.
- Backend usa esses valores diretamente se presentes; senão, deriva das parcelas.

### 4. Após deploy
O utilizador precisa clicar em **"Reparar Campos"** (action `repair_fields` já existente na integração) para criar os 9 novos user-fields nos Deals já instalados. Documentar isto no fim.

## Fora do âmbito
- Sem migrações Supabase (tabelas já suportam via `metadata`).
- Sem alterar dashboards/relatórios.
- Sem popular retroativamente Deals antigos — só cobranças novas.

## Ficheiros afetados
- `supabase/functions/bitrix24-install/index.ts`
- `supabase/functions/payment-create/index.ts`
- `supabase/functions/bitrix24-payment-tab/index.ts`
