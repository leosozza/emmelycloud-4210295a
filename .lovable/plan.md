# Fix: erro `sepa_debit is invalid` ao criar cobrança

## Problema
No fluxo Emmely Pay do Bitrix, quando se escolhe **Cartão** e moeda **EUR**, a edge function `payment-create` envia à Stripe o array completo `["card", "multibanco", "mb_way", "sepa_debit"]`. A conta Stripe Portugal da Emmely não tem `sepa_debit` (nem eventualmente `mb_way`/`multibanco`) ativado no painel, e a Stripe rejeita a criação da sessão de checkout com o erro reportado.

A função `payment-create-link` já resolve isto com retry iterativo, mas `payment-create` (chamada pelo botão "Criar Cobrança" do iframe Bitrix e por cada parcela) não tem essa lógica.

## Solução

Editar apenas `supabase/functions/payment-create/index.ts`:

1. **Tratar "card"/"direto" como escolha explícita de cartão.** Em `getStripePaymentMethods`, quando `requestedMethod === "card"` ou `"direto"`, devolver `["card"]` em vez de expandir para todos os métodos da moeda. Isto reflete o que o utilizador selecionou no dropdown "Método: Cartão".
   - Só se `requestedMethod` for vazio/nulo é que se devolve o leque completo de métodos da moeda.

2. **Adicionar retry iterativo de métodos rejeitados** em `createStripePayment`, espelhando o padrão já presente em `payment-create-link/index.ts`:
   - Se a Stripe responder com `payment method type provided: <X> is invalid` ou `payment_method_types[n]: <X>`, remover `<X>` do array e tentar novamente.
   - Máx. 4 tentativas; se `card` também for rejeitado ou o array ficar vazio, aí sim lançar o erro amigável atual pedindo para ativar métodos no dashboard.
   - Registar em `console.warn` cada método descartado para diagnóstico.

3. **Redeploy** de `payment-create` após a edição.

## Fora do âmbito
- Sem mexer em `payment-create-link` (já funciona).
- Sem mexer no frontend Bitrix (`bitrix24-payment-tab`); os dropdowns de método continuam iguais.
- Sem alterar Asaas/BR.

## Ficheiros afetados
- `supabase/functions/payment-create/index.ts` (função `getStripePaymentMethods` e `createStripePayment`)
