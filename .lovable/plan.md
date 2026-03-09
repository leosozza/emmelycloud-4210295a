

## Plano: Corrigir botões Editar/Baixa no Payment Tab

### Problema
Os botões "✏ Editar" e "✓ Dar Baixa" não aparecem porque a condição na linha 176 exige `inst.transaction_id`, que é `undefined` quando o deal tem valor mas não tem transações criadas (caso da screenshot: Parcela 1/1 de 600€ gerada sinteticamente a partir do deal).

### Causa Raiz
Linhas 1088-1096: quando não existem transações, o sistema cria uma parcela sintética com `id: "deal-${entityId}"` mas sem `transaction_id`. A condição `inst.status !== "paga" && inst.transaction_id` falha.

### Solução

**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

1. **Linha 176**: Alterar condição para mostrar botões mesmo sem `transaction_id`:
   - De: `inst.status !== "paga" && inst.transaction_id`
   - Para: `inst.status !== "paga"`

2. **Linha 1091-1096**: Adicionar `transaction_id: undefined` explicitamente ao objecto sintético (já é o caso, mas manter claro).

3. **JS `submitEdit` e `submitBaixa`**: Quando `txId` começa com `"deal-"` (sintético), criar primeiro a transação via `payment-create` POST antes de fazer o PATCH. Lógica:
   - Se `txId.startsWith("deal-")` → POST para `payment-create` com os dados do deal para criar a transaction, depois usar o ID retornado para o PATCH/baixa.
   - Caso contrário → fluxo normal (PATCH direto).

4. **`openEditModal` e `openBaixaModal`**: Garantir que o `instJson` inclui `entity_id` do deal para que o JS consiga criar a transação se necessário.

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-payment-tab/index.ts` | Corrigir condição dos botões, adicionar lógica de criação automática de transaction no JS quando parcela é sintética |

