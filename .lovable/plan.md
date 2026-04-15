

## Plano: Corrigir Status de Pagamento (Enumeração Bitrix24)

### Problema
Os campos `UF_CRM_EMMELY_PAYMENT_STATUS` (Deal) e `UF_CRM_69B83DDB1F59D` (Fatura/Invoice) são do tipo **enumeração** no Bitrix24. O código atual envia strings como `"pending"`, `"paid"`, `"partial"` — mas o Bitrix24 exige os **IDs numéricos** das opções (ex: `9391` = Pendente, `9395` = Pago).

Da screenshot do utilizador (campo Invoice):
| ID | Valor |
|---|---|
| 9391 | Pendente |
| 9393 | Parcial |
| 9395 | Pago |
| 9397 | Cancelado |

Os IDs do campo no Deal são diferentes (atribuídos dinamicamente na instalação). Não podemos hardcodar — precisamos resolver dinamicamente.

### Solução

**Estratégia**: Antes de escrever no campo, chamar `crm.deal.fields` ou `crm.item.fields` para obter os IDs das opções da enumeração e mapear pelo VALUE (texto). Isto garante compatibilidade com qualquer instalação.

### Ficheiros a editar

**1. `supabase/functions/bitrix24-payment-tab/index.ts`**
- Adicionar função helper JS (inline no HTML) que resolve o ID da enumeração chamando `BX24.callMethod('crm.deal.fields')` para o Deal e cachear os IDs de `UF_CRM_EMMELY_PAYMENT_STATUS`
- Nos `crm.item.add` (linhas 1053-1055 e 1138-1145), o campo `UF_CRM_69B83DDB1F59D` deve usar os IDs conhecidos da Invoice: `9391` (Pendente), `9393` (Parcial), `9395` (Pago)
- Nos `crm.deal.update` (linhas 1093, 1123), resolver o ID da enumeração do Deal antes de escrever

**2. `supabase/functions/payment-webhook-stripe/index.ts`**
- Na linha 75, onde calcula `paymentStatus = "paid" | "partial"`, resolver para o ID numérico
- Antes de `crm.deal.update`, chamar `crm.deal.fields` para obter os IDs da enumeração `UF_CRM_EMMELY_PAYMENT_STATUS`
- Na atualização da Invoice (linha 160-164), usar `9395` para "paid" em `UF_CRM_69B83DDB1F59D`

**3. `supabase/functions/bitrix24-payment-webhook/index.ts`**
- Na criação de Invoices (linha 312), usar `9391` para "pending"
- Na atualização do Deal (linha 351), resolver ID da enumeração via `crm.deal.fields`

**4. `supabase/functions/sign-contract/index.ts`**
- Linha 476: `UF_CRM_EMMELY_PAYMENT_STATUS: "Pendente"` — resolver para o ID numérico

### Detalhes técnicos

Para as **Faturas (entity 31)**, os IDs são fixos conforme fornecidos pelo utilizador — podemos usar diretamente:
```typescript
const INVOICE_STATUS = { pending: 9391, partial: 9393, paid: 9395, cancelled: 9397 };
```

Para o **Deal**, os IDs variam por instalação. A função helper chamará:
```typescript
const fieldsRes = await callBitrix(endpoint, token, "crm.deal.fields", {});
const statusField = fieldsRes.result?.UF_CRM_EMMELY_PAYMENT_STATUS;
const items = statusField?.items || [];
// items: [{ ID: "123", VALUE: "Pendente" }, { ID: "456", VALUE: "Pago" }, ...]
```

Mapeamento: buscar pelo `VALUE` ("Pendente", "Parcial", "Pago", "Cancelado") e usar o `ID` correspondente.

