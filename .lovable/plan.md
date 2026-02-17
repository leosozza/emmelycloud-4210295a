
# Contadores nas Abas da Carteira

## Resumo

Adicionar badges com contagem de registos em cada aba da Carteira (Clientes, Servicos, SEF), buscando os totais via queries ao backend.

## Alteracoes

### Ficheiro editado: `src/pages/Carteira.tsx`

- Importar `useQuery` do `@tanstack/react-query` e o cliente do backend
- Fazer 3 queries de contagem (uma por tabela: `clients`, `services`, `sef_locations`) usando `.select('id', { count: 'exact', head: true })`
- Importar `Badge` de `@/components/ui/badge`
- Adicionar um `Badge` ao lado de cada label nas `TabsTrigger` mostrando o numero total de registos
- Enquanto carrega, mostrar "..." no badge; apos carregar, mostrar o numero

### Detalhes tecnicos

- Queries usam `{ count: 'exact', head: true }` para eficiencia (nao retorna dados, so a contagem)
- Cada query tem uma `queryKey` unica para cache independente
- Os badges usam a variante `secondary` para nao competir visualmente com as abas
- Sem alteracoes de base de dados
