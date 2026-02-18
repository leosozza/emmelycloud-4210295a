
# Evolucao do Sistema de Fluxos para Agente Inteligente Completo

## Visao Geral

Transformar o editor de fluxos num sistema completo como o PowerBot/n8n, com:
1. **Templates prontos** para criar fluxos rapidamente
2. **Nos de IA com intencoes** (a IA conversa, coleta dados e executa acoes)
3. **3 tipos de fluxo**: Apenas Fluxo, Fluxo de IA, Hibrido
4. **Gatilhos (triggers) avancados** para acionar fluxos automaticamente
5. **Agente principal** que vincula a fluxos, treinamento e sub-agentes

---

## 1. Templates de Fluxos Prontos

Dialog ao criar novo fluxo com opcao "Escolher Template" ou "Criar do Zero" (como no screenshot).

**Templates incluidos:**
- **Qualificacao de Leads**: Mensagem boas-vindas -> Perguntas (nome, telefone, segmento) -> Condicao por segmento -> Criar Lead no Bitrix
- **Triagem de Suporte**: Mensagem -> Menu de opcoes -> Condicao -> Transferir ou IA responde
- **Agendamento Inteligente**: IA coleta dados -> Consulta agenda no Bitrix -> Agenda automaticamente
- **Coleta de Dados**: IA com intencao de coletar nome, telefone, cidade -> Atualizar CRM

**Ficheiro novo:** `src/lib/flowTemplates.ts` com os nodes/edges pre-configurados para cada template.

**Alteracao em:** `src/pages/Flows.tsx` - Substituir o dialog simples por um dialog com selecao de templates (cards com icone e descricao) + botao "Criar do zero".

---

## 2. Nos de IA com Intencoes e Acoes

Transformar o no `ai_response` atual e adicionar novos tipos de IA:

### Novos tipos de no:

| Tipo | Label | Descricao |
|------|-------|-----------|
| `ai_intention` | IA - Intencao | A IA conversa para coletar informacoes especificas (nome, telefone, cidade, etc.) e guarda em variaveis |
| `ai_action` | IA - Acao | A IA executa acoes inteligentes (agendamento, consulta CRM, etc.) usando tool calling |
| `ai_router` | IA - Roteador | A IA analisa a mensagem e decide para qual ramo do fluxo seguir |

### Interface FlowAIIntention
```text
intentions: array de { fieldName, description, validation, required }
  - fieldName: nome da variavel (ex: "nome_cliente")
  - description: o que a IA deve perguntar (ex: "Identifique o nome completo")
  - validation: "text" | "phone" | "email" | "cpf" | "city" | "number"
  - required: boolean
maxTurns: numero maximo de turnos de conversa
successMessage: mensagem ao completar coleta
failureMessage: mensagem se nao conseguir
```

### Interface FlowAIAction
```text
actionType: "schedule" | "query_crm" | "update_crm" | "custom"
actionDescription: descricao em linguagem natural do que a IA deve fazer
toolConfig: configuracao especifica da acao (entity, fields, etc.)
resultVar: variavel para guardar resultado
```

### Interface FlowAIRouter
```text
routes: array de { label, description, handleId }
  - label: nome da rota (ex: "Suporte Tecnico")
  - description: quando seguir esta rota (ex: "Cliente menciona problema tecnico")
analysisPrompt: instrucao extra para a IA decidir
```

**Alteracoes em:**
- `FlowNodeTypes.ts`: Adicionar os 3 novos tipos, interfaces e metadata
- `CustomFlowNode.tsx`: Preview visual mostrando intencoes configuradas, acoes, rotas
- `NodeConfigPanel.tsx`: Painel de configuracao com lista dinamica de intencoes (add/remove campos), config de acoes e rotas
- `FlowNodePalette.tsx`: Automatico (ja renderiza por categoria)

---

## 3. Tipo de Fluxo (flow_type)

Adicionar campo `flow_type` na tabela `flows` com 3 opcoes:

| Valor | Label | Descricao |
|-------|-------|-----------|
| `flow` | Apenas Fluxo | Segue nos sequenciais sem IA |
| `ai` | Fluxo de IA | Agente inteligente que conversa e executa acoes |
| `hybrid` | Hibrido | Combina fluxo sequencial com nos de IA |

**Migracao SQL:** Adicionar coluna `flow_type text NOT NULL DEFAULT 'hybrid'` a tabela `flows`.

**Alteracao no dialog de criacao** e nos cards da lista para mostrar badge do tipo.

---

## 4. Gatilhos (Triggers) Avancados

Expandir o sistema de triggers para acionar fluxos automaticamente:

| Trigger | Descricao |
|---------|-----------|
| `keyword` | Palavra-chave na mensagem (ja existe) |
| `first_message` | Primeira mensagem de um contato (ja existe) |
| `manual` | Acionado manualmente (ja existe) |
| `webhook` | Chamada HTTP externa (ja existe) |
| `bitrix_event` | Evento do Bitrix24 (lead criado, deal movido, etc.) |
| `schedule` | Agendamento (horario especifico, recorrente) |
| `inactivity` | Sem resposta do cliente por X minutos |
| `tag` | Quando contato recebe uma tag especifica |
| `department_transfer` | Quando transferido para departamento |

### Interface FlowTriggerConfig
```text
bitrixEvent: { eventType, entityType, stageFrom, stageTo }
schedule: { cron, timezone }
inactivity: { minutes }
tag: { tagName }
department: { departmentName }
```

**Migracao SQL:** Adicionar coluna `trigger_config jsonb DEFAULT '{}'` a tabela `flows`.

**Alteracao no dialog de criacao** com configuracao especifica por tipo de trigger.

---

## 5. Agente Principal (Chatbot) com Vinculacoes

Expandir a pagina de Agentes para que cada agente possa:
- **Vincular a um fluxo** (ja tem `default_flow_id`)
- **Vincular a treinamento** (base de conhecimento RAG)
- **Vincular a sub-agentes** (delegar para outros agentes especializados)

### Migracoes SQL:
- Adicionar `training_collection_ids text[]` na tabela `ai_agents` (IDs das colecoes de treinamento vinculadas)
- Adicionar `sub_agent_ids uuid[]` na tabela `ai_agents` (IDs de sub-agentes)
- Adicionar `routing_rules jsonb` na tabela `ai_agents` (regras de quando delegar)

### Alteracao em `src/pages/Agentes.tsx`:
- No dialog de edicao, adicionar seccao "Vinculacoes":
  - Selector de fluxo padrao (dropdown com fluxos existentes)
  - Multi-select de colecoes de treinamento
  - Multi-select de sub-agentes com regras de routing
- Mostrar badges das vinculacoes nos cards dos agentes

---

## Resumo dos Ficheiros

### Ficheiros a criar:
- `src/lib/flowTemplates.ts` - Templates de fluxos pre-configurados

### Ficheiros a modificar:
- `src/components/flows/FlowNodeTypes.ts` - 3 novos tipos de IA + interfaces
- `src/components/flows/CustomFlowNode.tsx` - Preview visual dos nos de IA
- `src/components/flows/NodeConfigPanel.tsx` - Config de intencoes, acoes e rotas
- `src/pages/Flows.tsx` - Dialog com templates, tipo de fluxo, triggers avancados
- `src/pages/Agentes.tsx` - Vinculacoes com fluxos, treinamento e sub-agentes

### Migracoes SQL:
- `flows`: Adicionar `flow_type text`, `trigger_config jsonb`
- `ai_agents`: Adicionar `training_collection_ids text[]`, `sub_agent_ids uuid[]`, `routing_rules jsonb`
