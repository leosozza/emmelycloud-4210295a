<final-text>## O que encontrei

O placement atual não está alinhado com o projeto que funciona.

A diferença mais importante é esta:

- **No projeto atual**, quase todas as buscas da conversa usam `conversations` com filtro `status != "fechada"`.
- **No projeto que funciona**, a conversa é resolvida de forma mais determinística e a última conversa é carregada **mesmo se não estiver ativa**.

Isto explica muito bem o teu sintoma: o Bitrix abre o placement, mas ele mostra “Nenhuma conversa ativa encontrada” embora a conversa já exista.

Também vi mais 2 fragilidades no fluxo atual:
- o lookup por `bot_state` só varre **300 conversas**
- o vínculo do Deal depende muito de heurística (`phone`, `email`, `name`, `bot_state`) em vez de um vínculo persistido e reutilizável

## Plano

### 1. Corrigir a regra principal do lookup
**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

Trocar o comportamento de:
- “procurar apenas conversa aberta”

para:
- “procurar primeiro conversa ativa”
- “se não existir, carregar a **última conversa relacionada**, mesmo fechada”

Isto será aplicado a:
- lookup por telefone
- lookup por email
- lookup por `client_id`
- lookup por `bot_state`
- lookup por nome

### 2. Refatorar o lookup para ficar determinístico
**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

Padronizar a ordem de busca assim:
1. `leads.conversation_id`
2. `leads.client_id -> conversations.client_id`
3. `clients.bitrix24_id -> conversations.client_id`
4. `bot_state` por `bitrix_deal_id`, `bitrix_lead_id`, `bitrix_entity_id`
5. telefone / email / `@lid`
6. nome

A ideia é parar de depender tanto de “tentativas soltas” e reaproveitar vínculos já existentes.

### 3. Remover o gargalo do `bot_state`
**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

Hoje o `findConversationByBotState` lê só 300 conversas recentes e ignora fechadas.  
Vou ajustar para:
- priorizar match exato por IDs do Bitrix
- não perder conversas antigas/fechadas
- devolver a conversa mais recente entre as correspondentes

### 4. Persistir melhor os vínculos para não voltar a falhar
**Ficheiros:**
- `supabase/functions/bitrix24-crm-tab/index.ts`
- `supabase/functions/message-send/index.ts`

Quando o placement encontrar a conversa, gravar/normalizar no `bot_state`:
- `bitrix_deal_id`
- `bitrix_lead_id` (quando existir)
- `bitrix_entity_id`

E, quando fizer sentido, reforçar o vínculo local com `conversation_id` para que as próximas aberturas do placement sejam imediatas.

### 5. Melhorar logs de diagnóstico
**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

Adicionar logs claros para mostrar:
- qual ramo encontrou a conversa
- se a conversa encontrada estava `fechada` ou ativa
- quais IDs Bitrix foram usados no match

Isso facilita validar o caso do Deal **23693** sem ficar no escuro.

## Detalhes técnicos

A causa mais provável neste caso é:
```text
placement atual:
  CRM entity -> heurísticas em conversations -> ignora status=fechada

projeto que funciona:
  CRM entity -> vínculo determinístico -> última conversa
```

A correção principal é mudar de:
```text
"buscar apenas conversa ativa"
```

para:
```text
"buscar conversa ativa primeiro; se não houver, mostrar a última conversa vinculada"
```

## Ficheiros a editar
- `supabase/functions/bitrix24-crm-tab/index.ts`
- `supabase/functions/message-send/index.ts`

## Resultado esperado
Depois desta correção, o placement deve:
- abrir a conversa já existente do cliente/deal
- não sumir só porque a conversa foi fechada
- reaproveitar vínculos já gravados no sistema
- ficar consistente com o comportamento do outro projeto</final-text>