

## Plano: Testar Fluxo de Cobrança — Deal 8901

O objetivo é simular o fluxo completo do robot `emmely_create_charge` para o deal 8901, com **3 parcelas**, gateway **direto** (crediário próprio), e depois ajustar os status para cenário de teste.

### 1. Criar 3 parcelas via `payment-create`
Chamar a edge function 3 vezes com `force_gateway: "direto"`, simulando o que o robot faz:

| Parcela | Valor | Vencimento | Descrição |
|---------|-------|------------|-----------|
| 1/3 | 333.33 EUR | 2026-04-03 | Parcela 1/3 - Deal 8901 |
| 2/3 | 333.33 EUR | 2026-05-03 | Parcela 2/3 - Deal 8901 |
| 3/3 | 333.34 EUR | 2026-06-03 | Parcela 3/3 - Deal 8901 |

Cada chamada incluirá metadata com `bitrix_deal_id: "8901"` e `installment_group_id` compartilhado.

### 2. Ajustar status das parcelas
Após criação, usar `payment-create` (PATCH) para:
- **Parcela 1**: status `confirmed` (paga)
- **Parcela 2**: manter `pending` + vencimento no passado (atrasada)
- **Parcela 3**: manter `pending` + vencimento futuro (em aberto)

### 3. Verificar na página Financeiro
Confirmar que as 3 transações aparecem corretamente com os status esperados.

### Execução
Tudo via chamadas directas às edge functions — sem alterações de código.

