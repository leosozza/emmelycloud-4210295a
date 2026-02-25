

# Plano: Sistema de Agentes Especialistas com Routing por Intencao

## Conceito

Transformar o sistema de agentes numa arquitectura de **orquestrador + especialistas**:

- **Agente Responder** (padrao): responde ao cliente, detecta intencoes e transfere para especialistas
- **Agente Acao**: executa um fluxo especifico (agendamento, cobranca, etc.)
- O agente principal analisa cada mensagem e decide se deve responder ou delegar a um sub-agente

## Estado Actual

- `ai_agents` tem campos `sub_agent_ids` (uuid[]) e `routing_rules` (jsonb) -- **nunca usados no backend**
- `chatbot-reply` chama `ai-playground` diretamente, sem logica de routing
- `ai-playground` so gera texto, nao detecta intencoes nem delega

## Alteracoes

### 1. Base de Dados: nova coluna `agent_role`

Adicionar coluna `agent_role` (text, default `'responder'`) a `ai_agents` com valores:
- `responder` -- responde ao cliente com IA
- `action` -- executa um fluxo quando ativado
- `router` -- analisa intencao e delega (o orquestrador)

### 2. Estrutura do `routing_rules`

Definir o formato do jsonb `routing_rules` para cada sub-agente vinculado:

```json
{
  "routes": [
    {
      "agent_id": "uuid-do-agente-agendamento",
      "intent": "agendamento",
      "keywords": ["agendar", "marcar", "horário", "consulta"],
      "description": "Cliente quer agendar uma consulta ou reunião"
    },
    {
      "agent_id": "uuid-do-agente-cobranca",
      "intent": "cobranca",
      "keywords": ["pagar", "boleto", "fatura", "pagamento"],
      "description": "Cliente quer informações sobre pagamento"
    }
  ]
}
```

### 3. Frontend: `AgentFormDialog` melhorado

- Adicionar selector de **Papel** (Responder / Acao / Router) no formulario
- Quando `role = router` ou `role = responder` com sub-agentes:
  - Mostrar secao "Regras de Routing" com formulario para cada sub-agente selecionado
  - Campos: intent (texto), keywords (tags), descricao
- Quando `role = action`:
  - Tornar o campo "Fluxo padrao" obrigatorio (o fluxo que sera executado)
  - Esconder a secao de sub-agentes

### 4. Frontend: `AgentCard` melhorado

- Mostrar badge com o papel do agente (Responder / Acao / Router)
- Mostrar icones diferenciados por papel
- Mostrar lista de rotas configuradas no card do router

### 5. Backend: `chatbot-reply` com logica de routing

Apos obter a resposta do agente principal, adicionar uma etapa de **detecao de intencao**:

1. Se o agente tem `sub_agent_ids` e `routing_rules.routes`:
   - Primeiro, verificar keywords na mensagem do cliente (match rapido, sem custo de IA)
   - Se nao houver match por keyword, pedir a IA para classificar a intencao usando as descricoes das rotas
   - Se uma intencao for detectada, delegar para o sub-agente correspondente
2. Se o sub-agente tem `agent_role = action` e um `default_flow_id`:
   - Em vez de gerar resposta de texto, chamar o `flow-engine` com o fluxo vinculado
   - Guardar na conversa qual agente esta activo (`bot_state.active_agent_id`)
3. Se nenhuma intencao for detectada, o agente principal responde normalmente

### 6. Backend: `ai-playground` -- novo modo `classify_intent`

Adicionar um modo opcional ao `ai-playground` que, em vez de gerar resposta, classifica a intencao:

```json
// Request
{
  "agent_id": "...",
  "messages": [...],
  "mode": "classify_intent",
  "intents": [
    { "intent": "agendamento", "description": "..." },
    { "intent": "cobranca", "description": "..." }
  ]
}

// Response
{ "intent": "agendamento", "confidence": 0.92 }
```

O system prompt sera construido automaticamente para pedir ao modelo que classifique.

## Fluxo Completo (exemplo)

```text
Cliente: "Quero marcar uma consulta para a proxima semana"
          |
    [chatbot-reply]
          |
    agente principal (router/responder)
          |
    1. keyword match: "marcar" → intent "agendamento" ✓
          |
    2. delega para agente "Agendamento"
          |
    3. agente "Agendamento" tem default_flow_id
          |
    4. chama flow-engine com o fluxo de agendamento
          |
    5. bot_state.active_agent_id = agente-agendamento
          |
    [proximas mensagens vao direto para o agente de agendamento
     ate o fluxo terminar ou o cliente pedir para voltar]
```

## Ficheiros Alterados

| Ficheiro | Tipo |
|----------|------|
| Migracao SQL (nova coluna `agent_role`) | DB |
| `src/pages/Agentes.tsx` | Frontend |
| `src/components/agentes/AgentFormDialog.tsx` | Frontend |
| `src/components/agentes/AgentCard.tsx` | Frontend |
| `supabase/functions/chatbot-reply/index.ts` | Backend |
| `supabase/functions/ai-playground/index.ts` | Backend |

## Impacto

- Retrocompativel: agentes existentes ficam com `role = responder` por defeito
- Sem quebra de funcionalidade actual
- O routing por keyword e instantaneo (sem custo de IA)
- O routing por IA so e usado como fallback quando keywords nao matcham

