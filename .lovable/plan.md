

## Plano: Seleccionar Pipeline/Funil ao criar Deals novos no Bitrix24

### Contexto

Ao importar, existem dois cenários:
- **Cliente já existe no Bitrix24** (encontrado por NIF ou EF): o Deal é actualizado no pipeline onde já está
- **Cliente novo**: o Deal é criado, mas actualmente vai sempre para o pipeline padrão (CATEGORY_ID=0) com STAGE_ID "NEW" ou "WON"

O utilizador quer escolher **em qual pipeline (Category)** os novos Deals serão criados.

### Solução

**1. Frontend (`Bitrix24App.tsx`)**: Antes de iniciar a importação, quando `syncBitrix` está activo:
- Carregar a lista de pipelines via `bitrix24-fetch-entities?action=pipelines&entity=deal`
- Mostrar um `<Select>` para o utilizador escolher o pipeline de destino (ex: "Pipeline Geral", "Clientes Legacy", etc.)
- Enviar o `category_id` seleccionado no body do request

**2. Edge Function (`import-access-data/index.ts`)**:
- Aceitar novo parâmetro `category_id` (string, default "0")
- Passar para `syncClientToBitrix`
- Ao criar Deal novo (`crm.deal.add`), incluir `CATEGORY_ID: categoryId` nos `dealFields`
- Ao actualizar Deal existente, **não** alterar o CATEGORY_ID (mantém onde está)

### Ficheiros a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/import-access-data/index.ts` | Aceitar `category_id`, passar para `syncClientToBitrix`, incluir `CATEGORY_ID` só no `crm.deal.add` |
| `src/pages/Bitrix24App.tsx` | Carregar pipelines, mostrar Select, enviar `category_id` no request |

### Detalhe da lógica

```text
Deal encontrado por EF + TITLE?
  ├─ SIM → crm.deal.update (sem alterar CATEGORY_ID)
  └─ NÃO → crm.deal.add (com CATEGORY_ID do Select)
```

