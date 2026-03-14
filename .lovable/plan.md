

## Plano: Separar sincronização Bitrix24 como Fase 3 independente

### Problema
Actualmente as Fases 1 e 2 sincronizam com o Bitrix24 inline (flag `sync_bitrix`). O user quer que:
- **Fase 1**: Importar clientes apenas para o Supabase (sem Bitrix)
- **Fase 2**: Importar honorários apenas para o Supabase (sem Bitrix)
- **Fase 3**: Sincronizar com o Bitrix24 separadamente — buscar deals por telefone, campo UF (id_access) ou CPF/NIF, actualizar o deal, criar faturas e dar baixa

### Alterações

**1. Edge Function `import-access-data/index.ts`**
- Remover toda a lógica Bitrix das fases `clients_only` e `honorarios` (remover chamadas a `syncClientOnlyToBitrix` e `syncHonorariosToBitrix`)
- Remover parâmetros `sync_bitrix`, `member_id`, `category_id` dessas fases
- Adicionar novo mode `"sync_bitrix"` que:
  - Recebe `member_id`, `category_id`, `batch_start`, `batch_size`
  - Busca clientes do Supabase (tabela `clients`) com os seus `financial_records` agregados
  - Para cada cliente, procura o Deal no Bitrix por 3 critérios (em ordem): campo `UF_CRM_1768312831` (id_access via `notes`), NIF/CPF (`UF_CRM_EMMELY_NIF`), ou telefone do contacto
  - Se encontrar: actualiza o Deal com totais financeiros agregados
  - Se não encontrar: cria Contact + Deal novos
  - Cria/actualiza Smart Invoices (Type 31) por cada `financial_record` pendente ou pago
  - Dá baixa (marca como pago) nas invoices correspondentes a parcelas pagas

**2. Frontend `src/pages/Bitrix24App.tsx` — `ImportView`**
- Remover o switch "Sincronizar com Bitrix24" e a selecção de pipeline das Fases 1 e 2
- Adicionar **Fase 3** com:
  - Card separado "Sincronizar com Bitrix24"
  - Selecção de pipeline de destino
  - Botão "Sincronizar" que percorre os clientes em batches
  - Barra de progresso e logs (mesmo padrão das fases 1/2)
  - Só fica habilitado após Fase 1 e/ou 2 concluídas (`clientsDone || honorariosDone`)

### Fluxo final

```text
Fase 1: Upload TBL_Clientes.xlsx → Supabase only (clients table)
Fase 2: Upload Honorários.xlsx   → Supabase only (leads, cases, proposals, financial_records)
Fase 3: Sincronizar Bitrix24     → Busca clients + financial_records do Supabase
                                  → Match no Bitrix por UF/NIF/telefone
                                  → Cria/actualiza Deals + Smart Invoices
                                  → Baixa automática de parcelas pagas
```

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/import-access-data/index.ts` | Remover Bitrix das fases 1/2; adicionar mode `sync_bitrix` com lookup multi-campo e criação de faturas |
| `src/pages/Bitrix24App.tsx` | Remover toggle Bitrix das fases 1/2; adicionar card Fase 3 com pipeline selector + botão + progresso |

