

## Plano: Preencher Campos UF nas Smart Invoices

O utilizador forneceu os IDs dos campos personalizados nas Smart Invoices (entity type 31). Atualmente, ao criar faturas, estes campos não são preenchidos — apenas os campos nativos (`title`, `opportunity`, `parentId2`, etc.).

### Mapeamento dos campos

| Campo | UF ID | Quando preencher |
|---|---|---|
| Status de Pagamento | `UF_CRM_69B83DDB1F59D` | Na criação: `pending`. No webhook: `paid` / `partial` |
| Grupo de Parcelas | `UF_CRM_69B83DDB2661E` | Na criação: `groupId` |
| Gateway de Pagamento | `UF_CRM_69B83DDB2B85D` | Na criação: gateway usado |
| Total Pago | `UF_CRM_69B83DDB32521` | No webhook: valor acumulado pago |
| Link de Pagamento | `UF_CRM_69B83DDB38FF9` | Na criação: `payment_url` |
| Nº de Parcelas | `UF_CRM_69B83DDB3EAFC` | Na criação: total de parcelas |
| Parcelas Pagas | `UF_CRM_69B83DDB462B7` | No webhook: incrementar |
| Valor da Parcela | `UF_CRM_69B83DDB4C552` | Na criação: valor individual |
| Próximo Vencimento | `UF_CRM_69B83DDB525C9` | Na criação e no webhook: próxima data |

### Ficheiros a editar

**1. `supabase/functions/bitrix24-payment-tab/index.ts`**

Nos dois locais onde se cria Smart Invoice (`crm.item.add`):
- `submitInstallments` (linha 1053-1055)
- `generatePaymentLink` (linha 1129-1139)

Adicionar aos `fields`:
```javascript
UF_CRM_69B83DDB1F59D: 'pending',        // Status
UF_CRM_69B83DDB2661E: groupId,           // Grupo
UF_CRM_69B83DDB2B85D: gateway,           // Gateway
UF_CRM_69B83DDB38FF9: payment_url,       // Link
UF_CRM_69B83DDB3EAFC: totalParcelas,     // Nº Parcelas
UF_CRM_69B83DDB4C552: parcel.amount,     // Valor Parcela
UF_CRM_69B83DDB525C9: parcel.due_date    // Próx. Vencimento
```

Também corrigir o campo do Deal de `UF_CRM_EMMELY_RECEIPT_URL` para `UF_CRM_EMMELY_PAYMENT_URL` e adicionar `UF_CRM_EMMELY_PAYMENT_STATUS: 'pending'`.

**2. `supabase/functions/payment-webhook-stripe/index.ts`**

Quando marca a Smart Invoice como paga (`crm.item.update`, linha 129-137), adicionar:
```javascript
UF_CRM_69B83DDB1F59D: 'paid',            // Status
UF_CRM_69B83DDB32521: paidAmount,        // Total Pago
UF_CRM_69B83DDB462B7: parcelas_pagas     // Parcelas Pagas (incrementar)
```

Também adicionar ao `crm.deal.update`:
- `UF_CRM_EMMELY_TOTAL_PAID`: total acumulado pago
- `UF_CRM_EMMELY_PAYMENT_STATUS`: `'paid'` ou `'partial'`

**3. `supabase/functions/bitrix24-payment-webhook/index.ts`**

Na criação de Smart Invoices (linha 228-248), adicionar os mesmos campos UF da fatura.

### Detalhes técnicos
- O `payment_url` para `generatePaymentLink` vem de `data.transaction.payment_url`
- Para `submitInstallments`, o `payment_url` pode não existir imediatamente (criação batch) — preencheremos com vazio e será atualizado depois
- No webhook, para contar "Parcelas Pagas", consultaremos `payment_transactions` pelo `installment_group_id` com `status = 'paid'`

