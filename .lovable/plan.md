

## Plano: Adicionar filtros de Data e Status na importação Access

### Problema
A importação falha no batch 110 (`TypeError: Failed to fetch`) porque está a enviar todos os clientes de uma vez. Precisamos de filtros para importar subconjuntos menores.

### Implementação em `src/pages/Bitrix24App.tsx`

**1. Novos estados de filtro** (na `ImportacaoAccessView`):
- `filterDateFrom` / `filterDateTo` — intervalo de datas (baseado na coluna `DATA` dos honorários)
- `filterStatus` — multi-select: "QUITADO", "ATRASADO", "PENDENTE", "todos"

**2. Lógica de filtragem client-side** (antes de enviar ao backend):
- Filtrar `honorariosData` por `STATUS` e pela coluna `DATA` (data de fecho do contrato)
- Derivar os `clienteIds` dos honorários filtrados
- Filtrar `clientesData` para incluir apenas clientes com honorários que passam nos filtros
- Enviar apenas esses subconjuntos filtrados ao edge function

**3. UI dos filtros** (entre o upload e a pré-visualização):
- Linha com 3 campos: Data De, Data Até, Status (select multi ou dropdown)
- As estatísticas da pré-visualização actualizam-se automaticamente com os dados filtrados
- O botão de importar mostra a contagem filtrada

**4. Actualizar stats/useMemo** para usar os dados filtrados em vez dos dados completos.

### Ficheiro a modificar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Adicionar estados de filtro, UI de filtros, lógica de filtragem nos dados antes do envio |

