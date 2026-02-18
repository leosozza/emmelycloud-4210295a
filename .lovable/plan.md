

# Importar Fluxos do PowerBot para o Editor de Flows

## Objetivo
Criar um sistema de importacao que leia ficheiros JSON exportados do PowerBot e os converta automaticamente para o formato interno do nosso editor de fluxos (ReactFlow).

## Mapeamento de Tipos de No (PowerBot -> Emmely)

| PowerBot (`type`)    | Emmely (`nodeType`) | Descricao                        |
|----------------------|---------------------|----------------------------------|
| `initialNode`        | (trigger/start)     | No inicial do fluxo              |
| `messageNode`        | `message`           | Envio de mensagem                |
| `conditionalNode`    | `condition`         | Condicao/ramificacao             |
| `openAINode`         | `ai_response`       | Resposta IA (prompt/mission)     |
| `transferNode`       | `transfer`          | Transferir para atendente        |
| `updateCrmNode`      | `set_variable`      | Atualizar CRM (mapeado como var) |
| `createCrmNode`      | `webhook`           | Criar entidade CRM (webhook)     |

## O que sera importado de cada no

- **position**: Mantida do JSON original (ReactFlow compativel)
- **messageNode**: Extrai `messageData`, `sendAsWhisper`
- **conditionalNode**: Extrai `conditions` (array de comparacoes)
- **openAINode**: Extrai `prompt`, `type` (mission/prompt), `missionVariables`, `sendAsWhisper`, `AIId`
- **transferNode**: Extrai `transferType`
- **updateCrmNode / createCrmNode**: Extrai `fields`, `entity`, `pipeline`
- **edges**: Convertidas diretamente (source, target, sourceHandle ja sao ReactFlow)

## Implementacao

### 1. Funcao `importPowerBotFlow(json)` em `Flows.tsx`

Logica principal:
```text
1. Parse do JSON
2. Extrair botName -> nome do fluxo
3. Para cada node:
   - Mapear type do PowerBot para nodeType interno
   - Preservar position
   - Converter data para config estruturada
   - Aplicar estilo visual (cor, borda) baseado no tipo mapeado
4. Para cada edge:
   - Manter source, target, sourceHandle
   - Converter markerEnd para MarkerType.ArrowClosed
5. Criar fluxo no Supabase com nodes e edges convertidos
6. Abrir no editor automaticamente
```

### 2. UI - Botao "Importar" na lista de fluxos

- Botao ao lado do "Novo Fluxo" com icone Upload
- Abre file picker nativo (accept=".json")
- Le o ficheiro, valida a estrutura (deve ter `nodes` e `edges`)
- Mostra preview com: nome do bot, numero de nos, numero de conexoes
- Botao "Confirmar Importacao"

### 3. Validacao e tratamento de erros

- Verificar se o JSON tem a estrutura esperada (`nodes`, `edges`)
- Tipos de no desconhecidos: importar como `set_variable` generico com aviso
- Mostrar toast com resultado: "Importado: X nos, Y conexoes"

### Ficheiros a modificar
- `src/pages/Flows.tsx` - Adicionar botao de importacao, funcao de conversao, dialog de preview

