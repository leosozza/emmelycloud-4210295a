

## Problema

Dois problemas na Carteira dentro do Bitrix24:

1. **Limite de 1000 registos por query**: A edge function `bitrix24-fetch-portfolio` usa `.limit(2000)` para clientes (1058 existem, OK), mas os leads (1237) e financial_records (4455) são carregados via nested select que tem limite implícito de 1000 por chunk. Muitos registos ficam de fora.

2. **Dashboard não carrega**: A edge function provavelmente timeout ou retorna payload enorme (~4455 financial_records serializados inline). O response inclui `allRecords` para cada cliente, inflando massivamente o JSON.

### Dados reais
- 1058 clientes com "Access"
- 654 clientes com leads associados
- 1237 leads `access_import`
- 4455 financial_records associados

## Solução

Refatorar a edge function `bitrix24-fetch-portfolio` para:

### 1. Paginar queries de leads (superar limite 1000)
Em vez de `.in("client_id", chunk)` com nested select (que limita a 1000 resultados), buscar leads em chunks menores (50 client_ids por vez) e adicionar `.limit(5000)` explícito.

### 2. Fazer aggregação no servidor, não enviar `allRecords`
O payload actual envia todos os financial_records raw para o frontend. Em vez disso, calcular os totais no servidor e enviar apenas os dados agregados por cliente + resumo por lead/caso. Enviar `allRecords` apenas quando o frontend pedir detalhe de um cliente específico (ou limitar a parcelas).

### 3. Adicionar endpoint de detalhe por cliente
Para quando o utilizador expande uma linha na tabela, buscar os records desse cliente via query param `client_id`.

### Alterações concretas

**`supabase/functions/bitrix24-fetch-portfolio/index.ts`**:
- Buscar clientes com paginação real (loop com `range(offset, offset+999)` até acabar)
- Buscar leads em chunks de 50 client_ids com `.limit(2000)` explícito
- Remover `allRecords` do response principal — enviar apenas totais agregados por cliente
- Adicionar modo `?client_id=X` para retornar detalhe (records) de um cliente específico

**`src/pages/Bitrix24App.tsx` — `CarteiraAccessView`**:
- Ao expandir uma linha, chamar a edge function com `?client_id=X&member_id=Y` para buscar os records desse cliente
- Manter totais vindos do response principal

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-fetch-portfolio/index.ts` | Paginar queries, agregar no servidor, endpoint de detalhe |
| `src/pages/Bitrix24App.tsx` | Lazy-load detalhe ao expandir linha |

