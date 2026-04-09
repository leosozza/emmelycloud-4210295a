

# Corrigir Layout do Flow Importado do PowerBot

## Problema

O importador PowerBot preserva as posições originais dos nós (`pbNode.position`), que vêm do PowerBot sem organização visual adequada. Resultado: nós sobrepostos e layout confuso.

## Solução

Implementar **auto-layout** baseado em grafo dirigido (topological sort + camadas) no `convertPowerBotFlow`, organizando os nós automaticamente em colunas/linhas com espaçamento adequado.

## Alterações

### 1. `src/lib/powerbotImporter.ts` — Adicionar auto-layout

Após converter nós e edges, aplicar algoritmo de layout:

1. **Topological sort** usando BFS (Kahn's algorithm) a partir dos nós raiz (sem edges de entrada)
2. **Atribuir camadas (layers)**: cada nó recebe um nível baseado na profundidade máxima desde a raiz
3. **Posicionar**: X = camada × 320px, Y = índice dentro da camada × 180px
4. **Centrar verticalmente** cada camada para evitar layouts em escada

```text
Camada 0     Camada 1     Camada 2     Camada 3
[Início] --> [Condição] --> [IA]     --> [Bitrix]
                        --> [Msg]    --> [Transfer]
```

Espaçamento: **320px horizontal**, **180px vertical** entre nós.

### 2. Também corrigir os build errors pré-existentes

Corrigir os erros de TypeScript nas edge functions (`.catch()` em Postgrest builders, tipos `unknown`, `null` vs `undefined`):

- **`ai-parity-audit`** — `.catch()` → `.then()` pattern
- **`ai-process-message`** — `null` → `undefined` para `next_question`, `.catch()` fix
- **`bitrix24-events`** — `.catch()` fix
- **`bitrix24-fetch-entities`** — cast `contactIds` para `string[]`
- **`bitrix24-payment-handler`** — type guard no `err`
- **`bitrix24-payment-webhook`** — type guard no `e`
- **`bitrix24-send`** — `.catch()` fix
- **`bitrix24-test-connection`** — type guard no `err`
- **`flow-engine`** — `null` → `undefined`, return type fix
- **`generate-template-from-image`** — type guard
- **`import-access-data`** — implicit `any` parameter

## Ficheiros a editar

1. **`src/lib/powerbotImporter.ts`** — auto-layout no `convertPowerBotFlow`
2. **Edge functions com build errors** — fixes de TypeScript (10+ ficheiros, alterações mínimas de tipagem)

