

## Problema
Os nós de mensagem no /flows (`message`, `message_buttons`, `message_list`, `media`) enviam sempre via `message-send` (Meta/WUZAPI). Não há opção para escolher enviar via conectores Bitrix24 Open Channel (emmely_connector, powerzap, etc.).

## Solução

### 1. Adicionar campos ao FlowNodeData
**Ficheiro:** `src/components/flows/FlowNodeTypes.ts`
- Adicionar `connectorId?: string` e `connectorLineId?: number` à interface `FlowNodeData`

### 2. Criar endpoint para listar conectores activos
**Ficheiro:** `supabase/functions/bitrix24-worker/index.ts`
- Adicionar handler para `_listConnectors: true`
- Chama `imconnector.list` no Bitrix24 para listar todos os conectores registados (emmely_connector, powerzap, etc.)
- Combina com `imopenlines.config.list.get` para obter as Open Lines e seus nomes
- Retorna `[{ connectorId, connectorName, lineId, lineName }]`

### 3. Adicionar seletor de conector no painel de configuração
**Ficheiro:** `src/components/flows/NodeConfigPanel.tsx`
- Para nós de tipo `message`, `message_buttons`, `message_list`, `media` — adicionar um `<Select>` com label "Enviar via"
- Opções:
  - "Padrão (WhatsApp/Instagram)" — valor vazio (comportamento actual via `message-send`)
  - Conectores Bitrix24 activos — carregados do endpoint acima
- Grava `connectorId` e `connectorLineId` no nodeData

### 4. Tornar bitrix24-send flexível
**Ficheiro:** `supabase/functions/bitrix24-send/index.ts`
- Aceitar `connectorId` e `lineId` opcionais no body do request
- Usar o `connectorId` passado em vez do hardcoded `CONNECTOR_ID = "emmely_connector"`
- Se `lineId` fornecido, usar directamente (sem lookup de channel_mappings)

### 5. Implementar envio via conector no flow-engine
**Ficheiro:** `supabase/functions/flow-engine/index.ts`
- Nos cases `message`, `message_buttons`, `message_list`, `media`: verificar se `nodeData.connectorId` existe
- Se sim, chamar `bitrix24-send` com o `connectorId` e `connectorLineId` em vez de `message-send`
- Se não, manter o comportamento actual

## Detalhes técnicos

A API `imconnector.list` retorna todos os conectores registados no portal. O envio usa `imconnector.send.messages` com o `CONNECTOR` dinâmico:
```typescript
await callBitrix(endpoint, token, "imconnector.send.messages", {
  CONNECTOR: connectorId,  // "emmely_connector" ou "powerzap" etc.
  LINE: lineId,
  MESSAGES: [...]
});
```

## Ficheiros a editar
- `src/components/flows/FlowNodeTypes.ts`
- `src/components/flows/NodeConfigPanel.tsx`
- `supabase/functions/flow-engine/index.ts`
- `supabase/functions/bitrix24-send/index.ts`
- `supabase/functions/bitrix24-worker/index.ts`

