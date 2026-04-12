

# Aprimorar Sistema de Agentes IA, Flows e Melhorias Gerais
**Inspirado em conceitos do Paperclip (orquestração, governança, skills, heartbeats)**

---

## Contexto

O Paperclip é um sistema de orquestração de empresas autónomas com agentes IA. Os conceitos mais relevantes para o nosso sistema são:
- **Heartbeats** — agentes executam tarefas agendadas automaticamente
- **Skills** — ferramentas que o agente pode usar em runtime (ex: consultar CRM, gerar proposta)
- **Governança** — aprovações, pausas, limites de budget com enforcement real
- **Goal Alignment** — cada acção do agente conecta-se ao objectivo estratégico
- **Audit Trail** — rastreio completo de cada decisão do agente
- **Sub-flows** — flows que chamam outros flows (composição)

---

## Plano de Implementação (6 blocos)

### 1. Agent Skills System (Ferramentas do Agente)
Criar tabela `agent_skills` que define ferramentas que cada agente pode usar em runtime.

**DB Migration:**
```sql
CREATE TABLE agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL, -- 'bitrix_crm', 'generate_proposal', 'generate_contract', 'create_payment', 'search_knowledge', 'webhook', 'run_flow'
  skill_config JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
```

**Frontend:** Adicionar secção "Skills" no `AgentFormDialog.tsx` com toggles para cada skill disponível (Consultar CRM, Gerar Proposta, Criar Cobrança, Pesquisar Knowledge Base, Chamar Flow, Webhook).

**Backend:** `ai-process-message` passa as skills activas como `tools` na chamada à IA, permitindo que o agente decida autonomamente quando usar cada ferramenta.

### 2. Agent Heartbeats (Tarefas Agendadas)
Permitir que agentes executem acções periódicas (ex: verificar leads sem resposta, enviar follow-ups).

**DB Migration:**
```sql
CREATE TABLE agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL DEFAULT '0 9 * * 1-5', -- seg-sex 9h
  action_type TEXT NOT NULL, -- 'run_flow', 'check_leads', 'send_followup', 'generate_report'
  action_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;
```

**Edge Function:** `agent-heartbeat-runner` — chamada por cron (pg_cron ou webhook externo) que verifica heartbeats pendentes e executa as acções.

**Frontend:** Tab "Heartbeats" na página de Agentes para configurar tarefas agendadas.

### 3. Governança e Budget Enforcement Real
Actualmente o budget é apenas visual. Implementar enforcement real que pausa o agente ao exceder.

**Alterações:**
- `ai-process-message`: antes de chamar a IA, verificar custo acumulado do mês vs `monthly_budget_usd`. Se excedido, retornar `fallback_message` e registar alerta.
- Adicionar campo `governance_mode` ao agente: `autonomous` (executa tudo), `supervised` (pede aprovação em acções críticas), `restricted` (só responde, sem acções).
- **Frontend:** Selector de modo de governança no formulário do agente.

### 4. Sub-Flow Node (Flow chama Flow)
Novo tipo de nó no flow builder: `call_flow` — executa outro flow como sub-rotina.

**Alterações:**
- `FlowNodeTypes.ts`: Adicionar tipo `"call_flow"` com config `{ flow_id, pass_variables: boolean }`
- `flow-engine/index.ts`: Implementar case `"call_flow"` que carrega e executa o flow referenciado, passando variáveis
- `NodeConfigPanel`: Selector de flow para o nó `call_flow`
- Adicionar à categoria "Lógica" na paleta

### 5. Flow Execution Logs (Audit Trail)
Registar cada execução de flow com resultado de cada nó.

**DB Migration:**
```sql
CREATE TABLE flow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
  conversation_id UUID,
  trigger_type TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running', -- running, completed, failed, paused
  node_results JSONB DEFAULT '[]', -- [{node_id, type, result, duration_ms}]
  variables JSONB DEFAULT '{}',
  error TEXT
);
ALTER TABLE flow_execution_logs ENABLE ROW LEVEL SECURITY;
```

**Backend:** `flow-engine` regista cada execução e o resultado de cada nó.

**Frontend:** Tab "Execuções" na página /flows mostrando histórico com status, duração e detalhes de cada nó executado.

### 6. Melhorias Gerais no UI dos Agentes
- **Card do Agente melhorado:** Mostrar métricas em tempo real (requisições hoje, custo do mês, status do budget)
- **Duplicar Agente:** Botão para clonar agente existente com todas as configurações
- **Testar Agente inline:** Mini-chat de teste directamente no card (já existe training, expandir para teste rápido)
- **Ordenação drag-and-drop** dos agentes para definir prioridade de routing

---

## Ficheiros a Criar/Alterar

| Ficheiro | Acção |
|---|---|
| Migration SQL | Criar `agent_skills`, `agent_heartbeats`, `flow_execution_logs` + novos campos em `ai_agents` |
| `src/components/agentes/AgentFormDialog.tsx` | Skills, Heartbeats, Governança |
| `src/components/agentes/AgentCard.tsx` | Métricas inline, botão duplicar |
| `src/pages/Agentes.tsx` | Lógica de duplicar, carregar skills |
| `src/components/flows/FlowNodeTypes.ts` | Tipo `call_flow` |
| `src/components/flows/NodeConfigPanel.tsx` | Config do `call_flow` |
| `src/pages/Flows.tsx` | Tab "Execuções" |
| `supabase/functions/flow-engine/index.ts` | Sub-flow execution + logging |
| `supabase/functions/ai-process-message/index.ts` | Budget enforcement + skills as tools |
| `supabase/functions/agent-heartbeat-runner/index.ts` | **Nova** — executor de heartbeats |

---

## Prioridade de Implementação

1. **Sub-Flow Node** — impacto imediato na composição de automações
2. **Flow Execution Logs** — visibilidade e debugging
3. **Budget Enforcement** — segurança de custos
4. **Agent Skills** — autonomia do agente
5. **Melhorias UI** — qualidade de vida
6. **Heartbeats** — automação avançada

