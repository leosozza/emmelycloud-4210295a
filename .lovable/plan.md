

## Plano: Corrigir Importação — Usar campo `UF_CRM_1768312831` nos Deals

### Problema actual

1. **Enums incorrectos** fazem a cadeia lead→caso→proposta→contrato→financial_records falhar silenciosamente (valores inválidos para `funnel_stage`, `proposal.status`, `contract.status`)
2. **Deals duplicados** — o código cria Deals novos em vez de procurar os existentes pelo campo `UF_CRM_1768312831` (ID do controle financeiro do Access)
3. **Valores não batem** — como os financial_records não são criados (enum fail), os totais ficam a zero

### Correcções em `supabase/functions/import-access-data/index.ts`

**1. Corrigir enums da cadeia Emmely:**

| Campo | Valor errado | Valor correcto |
|-------|-------------|----------------|
| `leads.funnel_stage` | `"convertido"` | `"fechado"` |
| `cases.status` | `"concluido"` | `"concluido"` (verificar enum real) |
| `proposals.status` | `"aceite"` | `"aceita"` |
| `contracts.status` | `"concluido"` / `"ativo"` | `"assinado"` / `"pendente"` |

**2. Bitrix24 — Buscar Deal existente por `UF_CRM_1768312831`:**

Em `syncClientToBitrix`, antes de criar um Deal novo para cada grupo de honorários:
- Buscar `crm.deal.list` com filtro `{ UF_CRM_1768312831: honorarioId }`
- Se encontrar → **update** o Deal existente (valor, stage, contacto)
- Se não encontrar → criar novo Deal **com** `UF_CRM_1768312831` preenchido

**3. Passar o `honorario.id` do Access para a função de sync:**

O `id` de cada honorário no JSON serve como chave de ligação com o campo `UF_CRM_1768312831` do Deal. Ajustar a assinatura de `syncClientToBitrix` para receber os IDs e usá-los no filtro/criação.

**4. Adicionar error logging detalhado** em cada insert da cadeia para não falhar silenciosamente.

### Lógica actualizada do sync Bitrix24

```text
Para cada grupo de honorários (desc):
  1. Pegar o ID do Access do primeiro honorário do grupo
  2. Buscar Deal: crm.deal.list { UF_CRM_1768312831: accessId }
  3. Se encontrar → crm.deal.update (actualizar valor, stage, contacto)
  4. Se não → crm.deal.add com UF_CRM_1768312831 = accessId
  5. Smart Invoices: manter lógica actual (criar por parcela)
```

### Ficheiro a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/import-access-data/index.ts` | Corrigir enums + usar `UF_CRM_1768312831` para dedup de Deals + error logging |

