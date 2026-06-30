# Plano

Duas correções no placement Bitrix24, sem mexer em lógica de negócio fora do necessário.

## 1) Mapeamento de Campos não reflete campos auto-criados

Hoje `bitrix24-ensure-asaas-fields` e `bitrix24-spa-create-fields` criam campos `UF_CRM_EMMELY_*` no Bitrix automaticamente, mas a tela **Mapeamento** mostra tudo como "Não mapeado" porque depende de o usuário criar manualmente registros em `bitrix24_field_mappings`.

**Solução:** sugerir mapeamentos automáticos quando o sistema reconhece um campo Bitrix `UF_CRM_EMMELY_*` que tem coluna equivalente no Supabase, exibindo-os como "Auto (sistema)" e bloqueando edição/remoção.

- Em `src/components/bitrix24/FieldMappingManager.tsx`:
  - Adicionar tabela interna `SYSTEM_MAPPINGS` com a correspondência conhecida (ex.: deal → `UF_CRM_EMMELY_ASAAS_PAYMENT_ID` ↔ `proposals.bitrix_payment_id`, `UF_CRM_EMMELY_NFSE_URL` ↔ `financial_records.nfse_url`, etc.; lead → nada por enquanto).
  - Em `buildRows`, marcar linhas com `isSystem: true` quando o `bitrix_field_key` correspondente existir em `bitrixFields`. Pré-preencher `bitrixFieldKey` e `syncDirection` com base no `SYSTEM_MAPPINGS`.
  - Linhas `isSystem` mostram badge "Auto (sistema)" em verde, dropdown desabilitado e botão de remover oculto.
  - Contador "Mapeados" inclui os `isSystem`. `saveAll` ignora linhas `isSystem` (não grava em `bitrix24_field_mappings`).
- Sem mudança de schema, sem mudança em edge functions.

## 2) Criação de cobrança sem opções de entrada parcelada / método da entrada

A modal "Criar Cobrança" no placement (em `supabase/functions/bitrix24-payment-tab/index.ts`) hoje tem só **Entrada (valor)** + **Nº Parcelas** + **Intervalo** + **Método** único para tudo. A aplicação de referência (`bitrix24-asaas-link`) tem: valor de entrada, nº de parcelas da entrada, método da entrada, 1º vencimento da entrada; e depois saldo com nº parcelas, intervalo, vencimento e método próprios.

**Solução:** ampliar o modal e o submit no `bitrix24-payment-tab`:

- UI (HTML inline na função):
  - Seção **Entrada** (aparece quando `Entrada > 0`):
    - Nº de parcelas da entrada (1–12)
    - Método da entrada (card, pix, boleto, multibanco, mb_way, direto)
    - 1º vencimento da entrada
    - Intervalo entre parcelas da entrada (15/30 dias)
  - Seção **Saldo / Parcelas** mantém os campos atuais (nº parcelas, intervalo, 1º vencimento, método).
  - Atualizar `calcInstallments()` (já existe) para gerar preview com linhas `Entrada i/N` e `Parcela i/N`, validando que a soma das entradas == valor de entrada e total bate.
- Submit (`submitInstallments` no script da página):
  - Construir array unificado de parcelas com flag `is_down_payment` para as entradas (campo já existe em `InstallmentData`).
  - Continuar chamando os endpoints atuais (`payment-create` por item), passando `is_down_payment`, `payment_method` correto por linha, e `installment_number/total_installments` segmentados por grupo (entrada vs saldo).
- Renderização (`installmentRows` já trata `inst.is_down_payment` mostrando "Entrada"). Garantir que parcelas de entrada saiam ordenadas antes das de saldo.

Sem mudança em `payment-create`/webhooks (já aceita `is_down_payment` no payload). Sem mudança de schema.

## Fora de escopo
- Não mexer em `manage-credentials`, `payment-providers-status`, robots BizProc, sincronização Bitrix.
- Sem novos secrets, sem migrações, sem alteração da arquitetura existente.

## Resumo de arquivos a editar
- `src/components/bitrix24/FieldMappingManager.tsx` — mapeamentos automáticos do sistema.
- `supabase/functions/bitrix24-payment-tab/index.ts` — campos de entrada parcelada + método da entrada na modal e no submit.
