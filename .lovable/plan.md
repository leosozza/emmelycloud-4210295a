
Diagnóstico:
- O robot está a gravar o link do relatório como `${SUPABASE_URL}/functions/v1/payment-receipt?token=...` em vez de um link público do site.
- O retorno do Stripe (`success_url`/`cancel_url`) também aponta para a função, não para o domínio público.
- Hoje não existe uma rota pública no frontend para o relatório de pagamentos, como já existe para proposta e assinatura.
- Nos negócios que falharam, existe `receipt_links`, mas não existem `financial_records` associados; por isso a função devolve `<h1>Nenhuma parcela encontrada</h1>`.
- O módulo `bitrix24-payment-tab` já tem fallback para esse cenário, mas o relatório público ainda não.

Plano:
1. Criar uma rota pública no frontend: `/pagamento/:token`
   - Nova página React pública, fora do layout autenticado.
   - O cliente abrirá `https://emmelycloud.pages.dev/pagamento/<token>` sem login.

2. Adaptar o backend do relatório para servir dados ao frontend
   - Reaproveitar a lógica actual do `payment-receipt`, mas com modo de resposta em JSON para a nova página.
   - Manter compatibilidade com os links antigos para não quebrar links já gerados.

3. Corrigir o problema de “Nenhuma parcela encontrada”
   - Fazer o relatório público usar a mesma ordem de fallback do `bitrix24-payment-tab`:
     - `financial_records` por `contract_id` / `bitrix24_deal_id`
     - `payment_transactions` ligados ao negócio
     - se ainda não existir nada, gerar uma parcela sintética com base no valor do negócio no Bitrix24
   - Assim, negócios antigos/manuais deixam de abrir uma página vazia.

4. Trocar todos os links públicos para o domínio do site
   - `bitrix24-robot-handler`: gerar `FRONTEND_URL + /pagamento/<token>`
   - `payment-create-link`: voltar do Stripe para `/pagamento/<token>?payment=success|cancelled`
   - links copiados no Financeiro e no Bitrix24 também passam a usar o domínio público.

5. Gravar sempre no campo correcto do Bitrix24
   - Criar/usar `UF_CRM_EMMELY_RELATORIO_PAY`
   - O robot de relatório deve preencher este campo sempre que gerar o link
   - `UF_CRM_EMMELY_RECEIPT_URL` fica reservado apenas para comprovativos individuais, se necessário

Detalhes técnicos:
- Base pública: priorizar `FRONTEND_URL`, com fallback para `https://emmelycloud.pages.dev`.
- A nova página pública deve manter o comportamento actual: lista de parcelas, juros/multa, botão “Pagar” e mensagens de sucesso/cancelamento.
- Não deve existir redirecionamento para login no fluxo público.
- Os tokens existentes continuam válidos; muda apenas o URL de acesso.

Resultado esperado:
- O cliente recebe um link público em `emmelycloud.pages.dev`
- O link abre directamente no site, não na URL bruta da função
- O relatório deixa de falhar nos casos antigos em que não há `financial_records`
- O campo `UF_CRM_EMMELY_RELATORIO_PAY` fica sempre preenchido com o link correcto
