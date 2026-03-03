

## Corrigir campos do Robot `emmely_create_charge`

### Problema identificado

O campo `gateway` no robot actualmente tem as opções `auto, stripe, asaas, direto` — mas deveria ser `stripe_br, stripe_pt, asaas, direto` (e `auto`). Além disso, os campos `installments` (número de parcelas) e `first_due_date` (data do 1º vencimento) já existem no código mas podem não estar a aparecer correctamente no Bitrix24, e a descrição poderia ser mais clara.

### Alterações

#### 1. `bitrix24-reregister-bot/index.ts` — Corrigir opções do gateway

Alterar a propriedade `gateway` no robot de:
```
Options: { auto: "Automático", stripe: "Stripe", asaas: "Asaas", direto: "Crediário Próprio" }
```
Para:
```
Options: { auto: "Automático", stripe_pt: "Stripe Portugal (EUR)", stripe_br: "Stripe Brasil (BRL)", asaas: "Asaas Brasil (BRL)", direto: "Crediário Próprio" }
```

Reforçar que `installments`, `first_due_date` e `down_payment` tenham nomes mais claros:
- `installments` → "Nº de Parcelas" (Type: `int`, Required: `Y`, Default: `1`)
- `first_due_date` → "Data 1º Vencimento (DD/MM/AAAA)" (Type: `date`, Required: `Y`)
- `down_payment` → "Valor de Entrada (0 se não houver)" (Type: `double`, Default: `0`)
- `company_id` → "Empresa (UUID)" (Required: `N`)

#### 2. `bitrix24-robot-handler/index.ts` — Suporte a `stripe_pt` e `stripe_br` no roteamento

O `handleCreateCharge` já recebe o `gateway`, mas na lógica de determinação de `country` (linhas 244-246) e `companyGateway`, garantir que `stripe_pt` e `stripe_br` são tratados correctamente ao passar para `force_gateway` no `payment-create`. Actualmente já funciona, mas validar que o `credential_provider` da company resolve correctamente para ambos os Stripes.

#### 3. Redeployar ambas as functions

Após alterações, redeployar `bitrix24-reregister-bot` e `bitrix24-robot-handler`. O utilizador deverá executar o re-register para actualizar os campos no Bitrix24.

### Ficheiros afectados

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-reregister-bot/index.ts` | Corrigir opções de gateway para `stripe_pt`, `stripe_br`, `asaas`, `direto`; melhorar nomes dos campos |
| `supabase/functions/bitrix24-robot-handler/index.ts` | Pequeno ajuste no mapeamento `stripe_pt`/`stripe_br` no credential lookup |

