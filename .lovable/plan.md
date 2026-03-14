

## Plano: Fase 2 sem necessidade de re-upload de TBL_CLIENTE.xlsx

### Problema
A Fase 2 exige que `TBL_CLIENTE.xlsx` seja carregado novamente para calcular `filteredClientes` e enviar ao backend. Os clientes já existem na base de dados após a Fase 1.

### Solução

#### UI (`src/pages/Bitrix24App.tsx`)
1. Na Fase 2, remover a exigência do ficheiro `TBL_CLIENTE.xlsx` — torná-lo opcional
2. Quando `clientesData` não está disponível (ficheiro não carregado), derivar a lista de clientes **apenas dos honorários**: extrair IDs únicos de `CLIENTE` do `filteredHonorarios` e criar stubs mínimos `{ ID, NOME: "Cliente X" }` para contagem/stats
3. O `filteredClientes` passa a ser calculado a partir dos honorários quando `clientesData` é `null`
4. No `handleImportHonorarios`, enviar `clientes: []` (array vazio) ao backend — o edge function já suporta isto (linha 268-271: cria stubs automaticamente)
5. As stats de "Clientes" e "Activos" mostram apenas a contagem de IDs únicos nos honorários

#### Backend (sem alterações)
O edge function já trata o caso de `clientes` vazio no modo `honorarios` — procura clientes existentes na DB por `document_number` (linha 303-321).

### Ficheiro a modificar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Tornar `clientesData` opcional na Fase 2; derivar contagem de clientes dos honorários; enviar `clientes: []` quando sem ficheiro |

