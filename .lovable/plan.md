## Objetivo
Tornar o modal "Criar Cobrança" (Emmely Pay, iframe Bitrix24) mais automático: pega os produtos do Negócio, calcula saldo e valor das parcelas em tempo real, e limpa a exibição das opções.

## Alterações em `supabase/functions/bitrix24-payment-tab/index.ts`

### 1. Remover sufixo "x" dos seletores de Nº Parcelas
Nos três `<select>` (Entrada, Saldo e Editar Parcela), voltar a exibir apenas o número (`1`, `2`, ..., `12`). O `value` continua numérico — só o texto muda. Assim automações que leiam o rótulo não quebram.

### 2. Auto-preencher "Valor Total" com soma dos produtos do Negócio
Quando `openCreateForm()` abre o modal:
- Se `pay-amount` estiver vazio/zero, chamar `BX24.callMethod('crm.deal.productrows.get', { id: ENTITY_ID })` (para Deals) ou o equivalente para SPA/Lead.
- Somar `PRICE * QUANTITY` de cada linha e escrever em `#pay-amount`.
- Disparar `calcInstallments()` para propagar os cálculos.
- Fallback silencioso: se a API falhar ou retornar vazio, usa o `OPPORTUNITY` já carregado (`totalValue` do deal).

### 3. Novos campos read-only para Saldo e Valor da Parcela
Adicionar dois campos visíveis (não editáveis, estilo `.b24-readonly`):
- **"Saldo a parcelar"** dentro do bloco Parcelas (Saldo) — mostra `Valor Total − Valor da Entrada`.
- **"Valor de cada parcela"** ao lado — mostra `saldo / nº parcelas`, formatado na moeda selecionada.

Ambos são atualizados dentro de `calcInstallments()` que já é disparado por todos os inputs relevantes (`pay-amount`, `pay-down`, `pay-installments`, `pay-currency`).

### 4. Ajustes em `calcInstallments()`
- Escrever nos dois novos campos.
- Continuar renderizando o `#installment-preview` com o resumo completo (datas, últimas parcelas com ajuste, total de faturas).

## Fora de escopo
- Modal "Editar Parcela" e demais fluxos.
- Alterações no backend `payment-create` — os cálculos continuam client-side; o servidor já recebe `amount`, `down_payment`, `num_installments`.
- Sincronizar mudanças de produtos em tempo real após abrir o modal (usuário fecha e reabre se editar produtos).

## Arquivos
- `supabase/functions/bitrix24-payment-tab/index.ts` (único arquivo).
