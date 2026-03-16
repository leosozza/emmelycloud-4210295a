

## Corrigir Mapeamento de Etapas dos Deals para Pipeline 15

### Problema
O código resolve dinamicamente as etapas via `crm.dealcategory.stage.list` usando SEMANTICS, o que pode resultar em etapas incorrectas. O utilizador quer mapeamento fixo para a Pipeline 15.

### Mapeamento Correcto
| Estado Financeiro | STAGE_ID |
|---|---|
| Quitado (all_paid) | `C15:WON` |
| Em dia (sem atraso) | `C15:NEW` |
| Atrasado (has_overdue) | `C15:UC_S7RLFB` |

### Alterações

**Ficheiro: `supabase/functions/import-access-data/index.ts`**

1. **Linha ~1031-1054** (sync_single_client): Substituir toda a lógica dinâmica de resolução de etapas por mapeamento directo:
   - `all_paid` → `C15:WON`
   - `has_overdue` → `C15:UC_S7RLFB`
   - default (em dia) → `C15:NEW`
   - Remover a chamada a `crm.dealcategory.stage.list` (elimina uma chamada API por cliente, melhora performance do batch)

2. **Linha ~1476** (sync_bitrix batch): Substituir o fallback genérico (`WON`/`EXECUTING`/`NEW`) pelo mesmo mapeamento `C15:*`:
   - `allPaid ? "C15:WON" : (hasOverdue ? "C15:UC_S7RLFB" : "C15:NEW")`

Isto garante que todos os deals criados no batch usam exactamente as etapas correctas da Pipeline 15, sem dependência de resolução dinâmica.

