

## Problema

O KPI "Clientes na Carteira" mostra **0** porque o dashboard consulta a tabela `clients` diretamente com a **anon key**. A politica RLS exige autenticacao (`to authenticated`), e como o Bitrix24 dashboard usa fetch direto sem sessao JWT, o resultado e sempre vazio — apesar de existirem **1058 clientes** na base de dados.

Os outros dados (portfolio, parcelas) funcionam porque usam a Edge Function `bitrix24-fetch-portfolio` que opera com `service_role`.

## Solucao

Usar a resposta do `bitrix24-fetch-portfolio` (que ja e chamado na aba Carteira) para alimentar o KPI de clientes no dashboard. Em vez de consultar `clients?select=id` com anon key, fazer uma chamada ao endpoint do portfolio e extrair o `clients.length`.

### Alteracoes em `src/pages/Bitrix24App.tsx`

1. **No `fetchAll` (~linha 411-430)**: Remover as duas chamadas a `clients?select=id` (linhas 421 e 428) e substituir por uma chamada a `bitrix24-fetch-portfolio?member_id=...` que retorna o array de clientes.

2. **Extrair count**: `clientsTotal = Array.isArray(data.clients) ? data.clients.length : 0`

3. Isto ja funciona correctamente na aba Carteira — basta reutilizar o mesmo endpoint no fetchAll do dashboard.

