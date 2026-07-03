## Diagnóstico do deal 45807

Nos logs de `bitrix24-robot-handler`:

```
Deal 45807 plan loaded. warnings=[
  "UF_CRM_EMMELY_PAYMENT_METHOD missing",
  "UF_CRM_EMMELY_FIRST_DUE_DATE missing for saldo"
]
```

O link **não foi gerado**: o robot abortou porque faltaram os campos obrigatórios `UF_CRM_EMMELY_PAYMENT_METHOD` e `UF_CRM_EMMELY_FIRST_DUE_DATE`. Hoje o robot devolve `error` para o BizProc mas **não escreve nada no timeline** — por isso o utilizador vê a etapa mudar para "Gerar link Pagamento" e nada mais.

## Objetivo

Sempre que o robot `emmely_create_charge` correr num deal/lead/SPA, deixar um comentário visível no timeline com:

- ✅ **Sucesso** — link gerado, valor, moeda, gateway, nº de parcelas, URL de pagamento (clicável) e nº de faturas criadas.
- ❌ **Erro / validação falhou** — motivo curto (ex.: "Faltam campos: método de pagamento, data do primeiro vencimento") e sugestão de reabrir o negócio para preencher.

Assim o utilizador entende, direto no timeline do Bitrix24, se o link foi criado ou se faltou informação.

## Alterações

### 1. Helper `postDealTimelineComment` em `supabase/functions/bitrix24-robot-handler/index.ts`

Novo helper que chama `crm.timeline.comment.add` (docs: https://apidocs.bitrix24.com/api-reference/crm/timeline/comments/crm-timeline-comment-add.html) usando o binding correto conforme a entidade:

```ts
fields: {
  ENTITY_ID: <id>,
  ENTITY_TYPE: "deal" | "lead" | "dynamic_<spaTypeId>",
  COMMENT: <texto BB>,
  AUTHOR_ID: 1,
}
```

Faz retry via `callBitrixWithRefresh` (token) e captura erros sem quebrar o retorno para o BizProc.

### 2. Chamadas em `handleCreateCharge`

- **Antes do `return` de erro por validação** (linhas ~360-366, valores/método/data em falta): montar mensagem tipo:
  > ⚠️ Emmely Pay: não foi possível gerar o link de pagamento.
  > Campos em falta: método de pagamento, data do primeiro vencimento.
  > Preencha e mova o negócio novamente para "Gerar link Pagamento".
- **Antes do `return` de sucesso** (linhas ~573-581): mensagem tipo:
  > ✅ Emmely Pay: link de pagamento gerado.
  > Valor: €20,00 · Gateway: stripe_pt · Parcelas: 1
  > [Abrir link de pagamento](https://…)
  > Faturas Bitrix24 criadas: 1
- **No `catch` genérico** (linha ~582): comentário curto com o erro.

### 3. Aplicar a lead/SPA quando aplicável

Hoje o handler já sabe `entity_type` (deal por padrão). O helper aceita os três tipos e usa o `ENTITY_TYPE` correto para o timeline binding.

### 4. Não mexer noutros paths

Sem mudanças em UI, frontend, `bitrix24-payment-tab`, ou `payment-create-link` — apenas o robot handler.

## Validação

1. Reproduzir com deal 45807 (faltam campos) → confirmar comentário de erro no timeline.
2. Preencher os campos e disparar de novo → confirmar comentário de sucesso com URL clicável.
3. Verificar logs `bitrix24-robot-handler` para garantir que falhas no `timeline.comment.add` não quebram o retorno do BizProc.

## Arquivos

- `supabase/functions/bitrix24-robot-handler/index.ts` (único ficheiro alterado)
