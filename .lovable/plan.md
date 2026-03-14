

## Plano: Adicionar placement Emmely Pay na ficha de Contacto do Bitrix24

### Problema
O placement Emmely Pay só existe em Negócios (Deals). Quando se abre um Contacto no Bitrix24, não há visibilidade dos negócios vinculados, valores em aberto, quitados ou em atraso.

### Solução
1. Registar o placement `CRM_CONTACT_DETAIL_TAB` para o `bitrix24-payment-tab`
2. Adaptar o `bitrix24-payment-tab` para detectar quando `entityTypeId === 3` (Contacto) e buscar todos os Deals vinculados a esse contacto

### Alterações

**1. `supabase/functions/bitrix24-install/index.ts`**
- Após registar o Emmely Pay no `CRM_DEAL_DETAIL_TAB`, adicionar registo no `CRM_CONTACT_DETAIL_TAB` com o mesmo handler `paymentTabUrl`

**2. `supabase/functions/bitrix24-payment-tab/index.ts`**
- No handler principal, detectar `entityTypeId === "3"` (Contacto)
- Quando é um contacto:
  1. Chamar `crm.deal.list` com `filter: { CONTACT_ID: entityId }` para obter todos os deals do contacto
  2. Para cada deal, buscar as `payment_transactions` e `financial_records` existentes (mesma lógica actual)
  3. Renderizar um HTML multi-deal: cabeçalho com o nome do contacto, resumo total (valor total, pago, pendente, atrasado), e depois secções colapsáveis por deal com as parcelas
- Manter o fluxo actual para `entityTypeId !== "3"` (Deal/Lead/SPA) sem alterações

**3. Estrutura visual do Contact Payment Tab**

```text
┌─────────────────────────────────────────────────┐
│ Emmely Pay — Maria Silva                        │
│ 3 negócios • €4.500 total • €3.000 pago         │
│ ████████████████░░░░░ 67%                       │
├─────────────────────────────────────────────────┤
│ ▼ Deal #142: LEGALIZAÇÃO (€1.500) ✅ Quitado    │
│   1/3 €500 ✅ | 2/3 €500 ✅ | 3/3 €500 ✅       │
├─────────────────────────────────────────────────┤
│ ▼ Deal #143: REAGRUPAMENTO (€1.500) ⚠ Pendente  │
│   1/3 €500 ✅ | 2/3 €500 ✅ | 3/3 €500 🔴       │
├─────────────────────────────────────────────────┤
│ ▼ Deal #200: NACIONALIDADE (€1.500) Pendente     │
│   1/3 €500 pendente | 2/3 €500 pendente          │
└─────────────────────────────────────────────────┘
```

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Registar Emmely Pay no `CRM_CONTACT_DETAIL_TAB` |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Adicionar lógica para contactos: buscar deals vinculados e renderizar vista multi-deal com resumo financeiro |

