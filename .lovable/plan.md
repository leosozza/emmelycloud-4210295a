
## Problemas a resolver no neg. #44755 (e em geral)

1. **Duplicação.** Duplo-clique em "Criar Cobrança" criou 2 transações (13s de diferença) porque o botão é re-ativado antes do `location.reload()`.
2. **Sem link de retorno.** Após criar, o modal mostra apenas "1 fatura(s) criada(s) com sucesso!" e recarrega — o `payment_url` devolvido por `payment-create` é descartado, não é mostrado nem copiável.

## Mudanças

### A. `supabase/functions/bitrix24-payment-tab/index.ts` — `submitInstallments` (~983-1074)
- Adicionar flag `submitInFlight` no escopo da página; abortar reentradas silenciosamente.
- Gerar `clientSubmitKey = ENTITY_ID + ':' + Date.now() + ':' + Math.random()` e enviá-lo em `metadata.client_submit_key` para cada parcela.
- **Não reativar o botão em caso de sucesso** (só no ramo de erro). Manter `btn.disabled = true` até o utilizador fechar o modal.
- **Mostrar links após sucesso.** Em vez de só "X fatura(s) criada(s)…", renderizar em `#pay-result` uma lista com cada parcela criada:
  - "Parcela N/M — €X,XX"
  - Input read-only com o `payment_url` (vindo de `data.payment_url` ou `data.transaction.payment_url`) + botão "Copiar" (`navigator.clipboard.writeText`).
  - Botão "Abrir" (`window.open(url, '_blank')`).
  - Para método "direto"/"parcelado_direto", mostrar "Recebimento direto — sem link de pagamento" em vez do input.
- Substituir o `setTimeout(reload, 2000)` por um botão "Fechar e atualizar" que faz o reload, para o utilizador ter tempo de copiar.

### B. `supabase/functions/payment-create/index.ts` — idempotência
- Antes do `insert` em `payment_transactions` (linhas ~733-742), se `metadata.client_submit_key` estiver presente, fazer `select` de transações com a mesma `metadata->>'client_submit_key'` criadas nos últimos 60s; se existir, devolver essa transação (e `payment_url`) em vez de inserir nova.
- Garantir que a resposta de sucesso inclui sempre `payment_url` no topo do JSON (já existe via `result.payment_url`); o frontend usa `data.payment_url || data.transaction?.payment_url`.

### C. Limpeza dos dados do deal 44755
- Apagar `payment_transactions` `b3a9dfa5-64a0-42ca-8ef4-f569aa04e36e` (duplicada `card`). Manter `e5d5354c-...` (`parcelado_direto`).
- A Smart Invoice correspondente no Bitrix24 terá de ser apagada manualmente pelo utilizador no CRM (não há referência cruzada fiável para a remover automaticamente).

## Ficheiros tocados
- `supabase/functions/bitrix24-payment-tab/index.ts`
- `supabase/functions/payment-create/index.ts`
- DELETE em `payment_transactions` (via tool insert)

## Verificação
1. Abrir Emmely Pay no deal 44755, valor 10€/1 parcela, método Cartão → criar → modal mostra link copiável + botão Abrir.
2. Duplo-clique rápido em "Criar Cobrança" → só 1 transação criada (segunda é bloqueada pelo guard ou ignorada pela idempotência no backend).
3. `select count(*) from payment_transactions where metadata->>'bitrix_deal_id' = '44755' and created_at > now() - interval '5 minutes'` confirma 1 nova entrada.
