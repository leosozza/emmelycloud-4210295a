## Objetivo
Fazer a **cobrança automática via robots** (BizProc do Bitrix24) usar exatamente os mesmos campos `UF_CRM_EMMELY_*` que a calculadora manual escreve no negócio — para que "clicar no robot" produza o mesmo resultado que "clicar em Criar Cobrança" no Emmely Pay.

## Campos-fonte no Negócio (já preenchidos pela calculadora manual)
Entrada:
- `UF_CRM_EMMELY_DOWN_PAYMENT` (valor)
- `UF_CRM_EMMELY_DOWN_INSTALLMENTS` (nº parcelas da entrada)
- `UF_CRM_EMMELY_DOWN_METHOD`
- `UF_CRM_EMMELY_DOWN_FIRST_DUE`
- `UF_CRM_EMMELY_DOWN_INTERVAL`

Saldo:
- `UF_CRM_EMMELY_TOTAL_AMOUNT` (valor total)
- `UF_CRM_EMMELY_TOTAL_INSTALLMENTS` (nº parcelas do saldo)
- `UF_CRM_EMMELY_INSTALLMENT_VALUE`
- `UF_CRM_EMMELY_FIRST_DUE_DATE`
- `UF_CRM_EMMELY_INSTALLMENT_INTERVAL`
- `UF_CRM_EMMELY_PAYMENT_METHOD` (método do saldo)

Configuração geral:
- `UF_CRM_EMMELY_GATEWAY` (stripe_pt / stripe_br / asaas / auto)
- `CURRENCY_ID` do negócio (EUR/BRL)
- Contact vinculado (para nome/email/telefone/CPF)

## O que muda

### 1. `bitrix24-robot-handler` (ação `create_charge`)
Hoje espera `properties.amount`, `properties.installments`, `properties.down_payment`, etc, vindos do BizProc.

Novo comportamento:
1. Se `properties.deal_id` está presente, chama `crm.deal.get` (via integração Bitrix já resolvida) para carregar os `UF_CRM_EMMELY_*`.
2. **Sobrepõe** com as properties só quando o robot BizProc entrega explicitamente valor não vazio (ex: um robot que queira forçar `installments=1`). Caso contrário usa o deal.
3. Deriva:
   - Total, entrada, parcelas do saldo, método do saldo e da entrada, 1º vencimento, intervalo, moeda, gateway
4. Se contacto/empresa vinculados, faz lookup para preencher `customer_name/email/cpf/phone` sem depender de properties.
5. Executa o mesmo loop de `payment-create` que já existe — cria Entrada (parcela 0) + Parcelas 1..N do saldo com o `installment_group_id`.
6. Após criar, escreve `UF_CRM_EMMELY_PAYMENT_URL` (primeiro link em aberto) e `UF_CRM_EMMELY_PAYMENT_STATUS = Pendente`, igual ao fluxo manual.
7. Validações: se `TOTAL_AMOUNT ≤ 0` OU faltam `PAYMENT_METHOD`+`FIRST_DUE_DATE`, retorna `charge_status=error` com mensagem clara para BizProc mostrar.

### 2. `bitrix24-robot-asaas` (código `ASAAS_CHARGE`)
Hoje só cria **uma** cobrança única com `value` bruto passado pelo robot.

Novo comportamento:
- Passa a delegar no mesmo helper de leitura dos `UF_CRM_EMMELY_*` do deal e usa o loop de parcelas do handler (entrada + saldo). Assim ASAAS respeita entrada+parcelas configuradas na calculadora.
- Mantém compat: se o BizProc mandar `properties[value]` sem `deal_id`, continua a criar cobrança única (comportamento legado).

### 3. Helper partilhado (novo)
Criar `supabase/functions/_shared/deal-payment-fields.ts` com:
- `readEmmelyPaymentPlan(bitrixCallMethod, dealId)` → devolve `{ totalAmount, currency, gateway, downPayment, downInstallments, downMethod, downFirstDue, downInterval, remainingInstallments, remainingMethod, firstDue, interval, customer: { name, email, cpf, phone, companyId } }`
- Reutilizado por `bitrix24-robot-handler` e `bitrix24-robot-asaas`.

### 4. Robot register (documentação de campos)
Atualizar `bitrix24-robot-register-asaas`:
- `ASAAS_CHARGE`: remover `PROPERTIES.value` como obrigatório; adicionar comentário "Lê UF_CRM_EMMELY_TOTAL_AMOUNT + plano do negócio". Mantém `override_value` opcional para casos especiais.

## Fora de escopo
- Interface visual do robot no BizProc designer (Bitrix gere isso).
- Alteração do webhook de status (`bitrix24-sync-invoice-status`) — já funciona.
- Novo robot para **atualizar** cobrança existente (só criação, tal como hoje).

## Ficheiros a alterar
- `supabase/functions/_shared/deal-payment-fields.ts` (novo)
- `supabase/functions/bitrix24-robot-handler/index.ts` (função `handleCreateCharge`)
- `supabase/functions/bitrix24-robot-asaas/index.ts` (branch `ASAAS_CHARGE`)
- `supabase/functions/bitrix24-robot-register-asaas/index.ts` (metadata)

## Como validar
1. Preencher a calculadora manual num negócio de teste e **não** clicar em Criar Cobrança — só guardar.
2. Mover o negócio para a etapa que dispara o robot.
3. Confirmar no Emmely Pay que aparecem Entrada + N parcelas iguais ao que a calculadora previa, com `UF_CRM_EMMELY_PAYMENT_URL` preenchido no negócio.
