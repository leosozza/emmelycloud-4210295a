
# Plano: Criar Cobranças Parceladas com Faturas Individuais

## Cenario

O utilizador quer criar uma venda parcelada (ex: 1000 total = 500 entrada + 5 parcelas de 100) e que o sistema gere uma fatura individual para cada parcela, cada uma com vencimento diferente. Depois, cada fatura pode ser dada baixa individualmente.

## Alteracoes

### 1. Formulario na aba Emmely Pay (`bitrix24-payment-tab/index.ts`)

Adicionar campos ao formulario "Criar Cobranca":

- **Valor Total** (campo existente, renomeado)
- **Entrada** (novo campo, valor opcional, default 0)
- **Numero de Parcelas** (novo campo, dropdown 1-12, excluindo a entrada)
- **Intervalo entre parcelas** (novo campo, dropdown: 30/60/90 dias)
- **Primeira parcela vence em** (novo campo, date input, default = hoje + intervalo)

Logica de calculo exibida em tempo real no formulario:
```text
Total: 1.000,00
Entrada: 500,00
Parcelas: 5x de 100,00
Vencimentos: 01/04, 01/05, 01/06, 01/07, 01/08
```

Ao submeter, o formulario chama `payment-create` em loop (ou uma nova rota batch) para cada parcela, com `installment_number`, `total_installments` e `due_date` nos metadados.

### 2. Backend `payment-create/index.ts`

Adicionar suporte a novos parametros opcionais no body:

- `installments` (numero de parcelas total incluindo entrada)
- `installment_number` (numero desta parcela)
- `total_installments` (total de parcelas)
- `due_date` (data de vencimento especifica para esta parcela)
- `installment_group_id` (UUID gerado pelo frontend para agrupar todas as parcelas da mesma venda)

Quando `due_date` e fornecido, usar esse valor em vez de calcular `hoje + 3 dias`.

O campo `metadata` da transacao ira conter:
```text
{
  bitrix_deal_id: "123",
  installment_group_id: "uuid-grupo",
  installment_number: 1,
  total_installments: 6,
  is_down_payment: true/false
}
```

### 3. Logica do Formulario (JavaScript no iframe)

A funcao `submitPayment` sera substituida por `submitInstallments` que:

1. Calcula o valor da entrada e o valor de cada parcela
2. Gera um `installment_group_id` (UUID simples)
3. Chama `payment-create` N vezes sequencialmente (entrada + parcelas)
4. Exibe progresso: "A criar parcela 1/6...", "A criar parcela 2/6..."
5. Ao terminar, recarrega a pagina

### 4. Exibicao no Painel

As transacoes ja aparecem agrupadas naturalmente porque sao filtradas por `bitrix_deal_id`. A numeracao `Parcela X/Y` ja funciona com o campo `installment_number` / `total_installments` nos metadados.

Melhoria: ao renderizar, agrupar transacoes pelo `installment_group_id` e usar `metadata.installment_number` e `metadata.total_installments` para a numeracao em vez do indice do array.

Se `metadata.is_down_payment` for true, mostrar "Entrada" em vez de "Parcela 1/6".

## Detalhes Tecnicos

### Ficheiros alterados

1. **`supabase/functions/bitrix24-payment-tab/index.ts`**
   - Formulario HTML: novos campos (entrada, parcelas, intervalo, primeiro vencimento)
   - JavaScript: calculos em tempo real, funcao `submitInstallments`, geracao de UUID
   - Renderizacao: usar metadados `installment_number` e `is_down_payment` para labels

2. **`supabase/functions/payment-create/index.ts`**
   - Aceitar `due_date` opcional e usar como vencimento no Asaas/Stripe
   - Persistir `installment_number`, `total_installments`, `installment_group_id` no metadata

### Calculo de parcelas

```text
totalValue = 1000
downPayment = 500
remaining = totalValue - downPayment = 500
numInstallments = 5
installmentValue = Math.floor(remaining * 100 / numInstallments) / 100 = 100.00
lastInstallment = remaining - (installmentValue * (numInstallments - 1)) = 100.00
```

A ultima parcela absorve a diferenca de arredondamento.

### Vencimentos

```text
intervalo = 30 dias
primeiroVencimento = 2026-04-01

Entrada: vencimento = hoje (imediato)
Parcela 1: 2026-04-01
Parcela 2: 2026-05-01
Parcela 3: 2026-06-01
...
```

### Fluxo completo

```text
1. Utilizador preenche: Total=1000, Entrada=500, Parcelas=5, Intervalo=30d
2. Frontend calcula: Entrada (500) + 5x de 100
3. Frontend gera installment_group_id = "abc-123"
4. Frontend chama payment-create 6 vezes sequencialmente:
   - Parcela 0 (entrada): amount=500, due_date=hoje, is_down_payment=true
   - Parcela 1: amount=100, due_date=+30d
   - Parcela 2: amount=100, due_date=+60d
   - ...
5. Cada chamada cria uma fatura no gateway (Asaas/Stripe)
6. Cada fatura tem o seu proprio link de pagamento
7. Pagina recarrega e mostra 6 cards com status individual
8. Webhook de pagamento da baixa individual em cada fatura
```

## Resumo de Impacto

- Formulario de criacao de cobranca evolui para suportar parcelamento
- Backend `payment-create` aceita due_date e metadados de parcela
- Cada parcela gera uma fatura independente no gateway
- Baixa individual via webhook existente (sem alteracoes nos webhooks)
- Visual do painel aproveita a estrutura existente de cards
