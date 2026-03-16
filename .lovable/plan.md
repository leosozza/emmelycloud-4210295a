

## Correcção: Stages e Datas das Smart Invoices (Type 31)

### Problema actual
As faturas estão a ser criadas com stages errados (`DT31_6:*`) e as datas não estão correctamente mapeadas no segundo bloco (`sync_bitrix`).

### Mapeamento correcto de stages
| Status local | Stage Bitrix24 | Significado |
|---|---|---|
| `pendente` | `DT31_3:N` | Em Aberto |
| `atrasada` | `DT31_3:S` | Atrasado |
| `paga` | `DT31_3:P` | Pago |
| `cancelada` | `DT31_3:UC` | Cancelado (Unpaid) |

### Mapeamento correcto de datas
| Campo Bitrix | Valor |
|---|---|
| `begindate` | Data de criação do contrato (`created_at` do financial_record / Coluna F) |
| `closedate` | Se paga → `paid_at`; senão → `due_date` |

### Alterações em `supabase/functions/import-access-data/index.ts`

**Bloco 1 — `sync_single_client`** (linhas ~1058-1076):
- `DT31_6:NEW` → `DT31_3:N` (pendente)
- `DT31_6:P` → `DT31_3:P` (pago)
- `DT31_6:UC` → `DT31_3:S` (atrasado)
- Adicionar stage `DT31_3:UC` para `cancelada`
- `begindate` = `fr.created_at` (data contratação)
- `closedate` = `fr.paid_at` se paga, senão `fr.due_date`

**Bloco 2 — `sync_bitrix`** (linhas ~1418-1436):
- Mesmas correcções de stages
- Corrigir `closedate` (actualmente sempre = `due_date`, falta usar `paid_at` para pagas)
- `begindate` = `fr.created_at`

### Ficheiros alterados
- `supabase/functions/import-access-data/index.ts` (2 blocos de invoice creation)

