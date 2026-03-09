

## Problema Identificado

Dois bugs na criação dos campos customizados no Bitrix24:

### 1. Código de idioma errado: `pt` → `br`
O Bitrix24 usa o código **`br`** para Português (não `pt`). Como o portal está em Português, o sistema está a usar o fallback `en` (inglês) para os labels porque não encontra a chave `br`.

### 2. Falta `SORT` no campo (nível field, não list)
Cada campo deve ter uma propriedade `SORT` ao nível do campo (ex: `SORT: 10, 20, 30...`) para definir a ordem de exibição no formulário. Sem isto, o Bitrix24 atribui `100` por defeito a todos.

## Correção

### Ficheiro: `supabase/functions/bitrix24-install/index.ts`

Atualizar as **duas definições duplicadas** do array `emmelyUserFields` (linhas ~180-283 e ~696-800):

1. Mudar todas as chaves de idioma de `{ pt: "...", en: "..." }` para `{ br: "...", en: "..." }` nos campos `EDIT_FORM_LABEL`, `LIST_COLUMN_LABEL` e adicionar `LIST_FILTER_LABEL`
2. Adicionar `SORT` sequencial a cada campo: 10, 20, 30... 110

Exemplo de campo corrigido:
```typescript
{
  FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
  USER_TYPE_ID: "enumeration",
  SORT: 10,
  EDIT_FORM_LABEL: { br: "Status de Pagamento", en: "Payment Status" },
  LIST_COLUMN_LABEL: { br: "Status Pagamento", en: "Payment Status" },
  LIST_FILTER_LABEL: { br: "Status Pagamento", en: "Payment Status" },
  LIST: [...],
}
```

Após deploy, executar `repair_fields` novamente para recriar com os valores corretos.

