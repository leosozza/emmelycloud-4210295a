

## Análise Profunda — Emmely Pay

### Estado Atual

O sistema está **estruturalmente funcional** com 16 transações registadas (Stripe PT, Stripe BR, Asaas, Direto). Os 3 gateways, webhooks, Bitrix24 badges, late fees config e payment reminders estão implementados.

### Problemas Identificados

**1. CRÍTICO — Late Fees não são aplicados em nenhum fluxo real**
O `calculateLateFees()` em `src/lib/lateFeeCalc.ts` existe mas **não é usado em lado nenhum** — nem no `payment-create`, nem no `payment-reminder`, nem no Payment Tab do Bitrix24. O simulador funciona na UI mas os encargos nunca são calculados/adicionados ao valor cobrado quando uma parcela está em atraso. É apenas visual.

**Correcção:** Integrar `calculateLateFees` no `payment-reminder` (ao gerar cobrança de parcela vencida, calcular encargos e somar ao valor) e no Payment Tab do Bitrix24 (mostrar valor com encargos para parcelas atrasadas).

**2. IMPORTANTE — Testes de conexão criam transações reais**
Os botões "Testar Conexão" (Stripe PT, BR e Asaas) chamam `payment-create` que **cria transações reais** na base de dados (€1.00, R$5.00). Existem já 6 transações de teste pendentes. Isto polui os dados financeiros.

**Correcção:** Adicionar um campo `is_test: true` na metadata ou criar um endpoint de teste dedicado que valide a API key sem criar transação. Alternativa: usar a API de balance do Stripe (`/v1/balance`) para validar a key sem criar cobranças.

**3. IMPORTANTE — Checkout Session vs Payment Intent mismatch**
O `payment-create` guarda `data.payment_intent || data.id` como `gateway_payment_id`. Mas Checkout Sessions podem ter `payment_intent = null` (para métodos como Multibanco que são assíncronos). O webhook faz lookup por `gateway_payment_id` e pode falhar na reconciliação se o ID guardado for o `cs_` (session) em vez do `pi_` (payment intent).

**Correcção:** Guardar **ambos** IDs — o `checkout_session_id` já é guardado na metadata, mas o lookup no webhook deveria procurar também por `checkout_session_id` na metadata como fallback.

**4. MODERADO — Payment Reminder hardcoded para EUR**
A função `payment-reminder` tem `currency: "EUR"` hardcoded (linha 147 e no body do `payment-create` na linha 122). Clientes brasileiros receberão cobranças em EUR em vez de BRL.

**Correcção:** Determinar a moeda a partir do `financial_record` ou do `client.country`.

**5. MODERADO — Duplicação de `ensureValidToken` e `notifyBitrix24DealPayment`**
O código de refresh de token Bitrix24 e notificação de pagamento está duplicado identicamente em 4 ficheiros: `payment-webhook-stripe`, `payment-webhook-asaas`, `bitrix24-payment-tab`, `bitrix24-payment-webhook`. Manutenção difícil.

**6. MENOR — Financeiro page filtra apenas gateway "direto"**
A página `/financeiro` (Financeiro.tsx linha 49) faz `.eq("gateway", "direto")`, mostrando apenas pagamentos diretos. Transações Stripe e Asaas não aparecem nesta vista.

**7. MENOR — `LateFeeConfigCard` duplica lógica do `lateFeeCalc.ts`**
O simulador no componente recalcula manualmente em vez de usar a função `calculateLateFees` importável.

### Plano de Melhorias (por prioridade)

| # | Melhoria | Ficheiros |
|---|----------|-----------|
| 1 | **Integrar late fees no payment-reminder** — ao gerar cobrança de parcela vencida, buscar config de `late_fees` e somar encargos ao valor | `supabase/functions/payment-reminder/index.ts` |
| 2 | **Testes sem criar transações** — substituir os testes de conexão por chamadas à API de balance do Stripe e customers do Asaas | `src/pages/Integracoes.tsx` |
| 3 | **Fallback de lookup no webhook Stripe** — se não encontrar tx por `gateway_payment_id`, procurar `checkout_session_id` na metadata | `supabase/functions/payment-webhook-stripe/index.ts` |
| 4 | **Currency dinâmica no reminder** — detectar moeda via client country ou financial record | `supabase/functions/payment-reminder/index.ts` |
| 5 | **Usar `calculateLateFees` no simulador** — importar a função em vez de duplicar a lógica | `src/pages/Integracoes.tsx` |
| 6 | **Financeiro mostrar todos os gateways** — remover filtro `.eq("gateway", "direto")` ou adicionar filtro seleccionável | `src/pages/Financeiro.tsx` |

### Resumo

O core está sólido (criação, webhooks, Bitrix24 sync). Os problemas mais graves são a **não-aplicação real dos encargos por atraso** e os **testes que criam transações reais**. Os restantes são melhorias de robustez e manutenibilidade.

