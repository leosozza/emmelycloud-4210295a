

## Bug: Todos os clientes sincronizam para o mesmo Contact 1687 / Deal 13

### Análise

Dos network requests, **todos os clientes diferentes** retornam:
- `"Contacto 1687 actualizado"` + `"Deal 13 actualizado (stage: C15:NEW)"`

Excepto "Cliente 1081" (NIF=`ACCESS_1081`) que corretamente **criou** Contact 113469 e Deal 12315.

**Causa raiz**: O campo `UF_CRM_1768312831` (Access ID) provavelmente **não existe** no Bitrix24 ou o campo `UF_CRM_EMMELY_NIF` não existe. Quando o Bitrix24 recebe um filtro com um campo UF inexistente, **ignora o filtro** e retorna TODOS os deals — o código pega o primeiro (Deal 13) e assume que é match.

O mesmo acontece com `all_paid=false` para clientes Quitados — mas isso é um problema secundário (provavelmente os `financial_records` não têm status `paga` ou o filtro `sync_source = 'access_import'` não encontra os leads).

### Solução

#### 1. Validar resultados do lookup antes de aceitar

Após cada `crm.deal.list`, verificar que o resultado **realmente contém** o valor filtrado. Se o campo UF não existir no resultado, ignorar o match:

```typescript
// Antes (buggy):
if (res.result?.length > 0) {
  dealId = res.result[0].ID;
}

// Depois (safe):
if (res.result?.length > 0) {
  const match = res.result[0];
  // Validate the field actually matches
  if (match.UF_CRM_1768312831 === info.access_id) {
    dealId = match.ID;
  }
}
```

No entanto, `crm.deal.list` por defeito não retorna campos UF no `select`. A abordagem mais segura é:

**Adicionar validação de contagem**: Se o filtro retorna muitos resultados (>5), provavelmente o campo não existe e o filtro foi ignorado — rejeitar o match.

#### 2. Para o `sync_single_client` (Etapa B - novos), forçar criação

Quando o utilizador está na Etapa B (clientes sem Deal), o sistema deve **saltar o lookup** e criar directamente. Adicionar um parâmetro `force_create` ao payload.

#### 3. Corrigir `all_paid` para clientes Quitados

Adicionar log para debug e verificar que a query `sync_source = 'access_import'` está a encontrar os leads corretos com `financial_records.status = 'paga'`.

### Alterações

- **`supabase/functions/import-access-data/index.ts`**:
  - Nas 4 lookup queries (access_id, NIF, phone, email/name), adicionar validação: rejeitar se `res.total > 5` (indica filtro ignorado) ou se retorna 0 resultados reais
  - Incluir o campo filtrado no `select` para validação cruzada
  - Adicionar `force_create` flag que salta todo o lookup (para Etapa B)
  - Adicionar logs detalhados no `fetchClientWithFinancials` para debug do `all_paid`

