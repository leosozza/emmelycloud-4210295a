

# Corrigir SORT e Labels dos Campos Emmely Pay no Bitrix24

## Problema

Os campos `UF_CRM_EMMELY_*` estão a ser criados com `SORT: 10, 20, 30...` mas o utilizador quer **SORT: 0** para todos (para aparecerem no topo). Além disso, os labels (`EDIT_FORM_LABEL`, `LIST_COLUMN_LABEL`, `LIST_FILTER_LABEL`) devem estar em **LETRAS MAIUSCULAS**.

## Alterações

### Ficheiro: `supabase/functions/bitrix24-install/index.ts`

Existem **duas cópias** do array `emmelyUserFields` (linhas ~180 e ~734). Ambas devem ser actualizadas:

1. **SORT**: Alterar todos os campos de `SORT: 10/20/30/.../130` para `SORT: 0`
2. **Labels**: Converter todos os valores de `EDIT_FORM_LABEL`, `LIST_COLUMN_LABEL` e `LIST_FILTER_LABEL` para maiusculas

Exemplo de antes/depois:

```typescript
// ANTES:
{
  FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
  SORT: 10,
  EDIT_FORM_LABEL: { br: "Status de Pagamento", en: "Payment Status" },
  LIST_COLUMN_LABEL: { br: "Status Pagamento", en: "Payment Status" },
}

// DEPOIS:
{
  FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
  SORT: 0,
  EDIT_FORM_LABEL: { br: "STATUS DE PAGAMENTO", en: "PAYMENT STATUS" },
  LIST_COLUMN_LABEL: { br: "STATUS PAGAMENTO", en: "PAYMENT STATUS" },
}
```

Todos os 13 campos seguem a mesma regra: `SORT: 0` + labels em MAIUSCULAS.

Após o deploy, utilizar o botão **"Reparar Campos"** nas Configurações do Bitrix24 para recriar os campos com os novos valores.

### Ficheiro a editar

1. **`supabase/functions/bitrix24-install/index.ts`** — alterar SORT para 0 e labels para MAIUSCULAS nas duas cópias do array `emmelyUserFields`

