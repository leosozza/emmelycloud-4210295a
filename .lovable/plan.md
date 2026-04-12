

# Analise CrewAI vs EmmelyCloud — Conceitos Aplicaveis

## O que e o CrewAI

CrewAI (48.6k stars) e um framework de orquestracao multi-agente com dois pilares:

1. **Crews** — equipas de agentes autónomos com papéis, goals e backstories, que colaboram via delegação de tarefas
2. **Flows** — workflows event-driven com decorators (`@start`, `@listen`, `@router`) e state management tipado, que orquestram Crews e lógica determinística
3. **Tasks** — unidades de trabalho com `expected_output`, `context` (tasks anteriores cujo output alimenta esta), e `output_file`
4. **Memory** — short-term, long-term, entity memory e user memory para contexto persistente entre interações
5. **Knowledge** — RAG integrado com knowledge sources (PDF, texto, JSON)
6. **Process Types** — `sequential` (um a um), `hierarchical` (manager delega automaticamente)
7. **Hooks** — lifecycle hooks (`@before_kickoff`, `@after_kickoff`) para pré/pós processamento
8. **Checkpoints** — save/restore de estado do flow para recuperação de falhas
9. **A2A (Agent-to-Agent)** — protocolo para agentes se comunicarem entre si
10. **Human-in-the-Loop (HITL)** — suporte nativo para pedir input humano durante execução

## O que e Aplicavel ao EmmelyCloud

CrewAI e um framework Python de orquestração. O EmmelyCloud e um CRM com agentes IA em Edge Functions. Não faz sentido portar o framework, mas há **5 padrões arquitecturais** de alto valor:

### Conceito 1: Task Delegation entre Agentes (ALTO IMPACTO)
O EmmelyCloud já tem `sub_agent_ids` mas não há lógica de delegação. No CrewAI, um agente pode delegar parte do trabalho a outro agente especializado. O agente "manager" avalia se precisa de ajuda e invoca o sub-agente automaticamente.

**Aplicação prática:** O agente principal recebe "preciso de ajuda com o meu contrato e com um pagamento". Delega a parte de contrato ao agente jurídico e a parte de pagamento ao agente financeiro, depois consolida as respostas.

### Conceito 2: Structured Task Output (ALTO IMPACTO)
No CrewAI, cada Task tem `expected_output` e pode ter `output_json`/`output_pydantic` para estruturar a resposta. Actualmente o `ai-process-message` gera texto livre. Com output estruturado, o agente pode retornar JSON tipado quando executa skills (ex: dados de um lead, proposta draft).

**Aplicação prática:** Quando o agente executa `query_crm`, em vez de receber texto livre do LLM, recebe `{ lead_id: "123", name: "João", status: "active" }` validado.

### Conceito 3: Hierarchical Process / Manager Agent (MEDIO IMPACTO)
No CrewAI, o `Process.hierarchical` cria automaticamente um "manager" que planeia, delega e valida. O EmmelyCloud pode implementar isto como um modo de routing onde o agente default funciona como router/manager que despacha para agentes especializados.

**Aplicação prática:** O cliente envia uma mensagem ambígua. O manager analisa a intenção, escolhe o agente mais adequado (jurídico, financeiro, atendimento), delega, e valida a resposta antes de enviar.

### Conceito 4: Flow State Management Tipado (MEDIO IMPACTO)
O flow-engine do EmmelyCloud usa `variables` como `Record<string, any>`. O CrewAI usa Pydantic models (BaseModel) para state tipado com validação. Podemos adicionar schema validation às variáveis de flow para prevenir erros silenciosos.

**Aplicação prática:** Um flow que coleta dados do cliente valida que `{{cpf}}` tem 11 dígitos, `{{email}}` tem formato válido, antes de prosseguir para o nó seguinte.

### Conceito 5: Human-in-the-Loop no ReACT Loop (MEDIO IMPACTO)
O CrewAI permite que um agente pause e peça confirmação humana antes de executar uma acção crítica. No EmmelyCloud, o ReACT loop executa tools automaticamente. Para acções sensíveis (criar proposta, mover deal), o agente deveria poder pedir confirmação.

**Aplicação prática:** O agente quer criar uma proposta de €5000. Em vez de criar directamente, envia ao operador: "Pretendo criar proposta de €5000 para João Silva. Confirma?" O operador aprova ou rejeita.

---

## Plano de Implementação (4 fases)

### Fase 1: Task Delegation no ReACT Loop
Permitir que o agente delegue sub-tarefas a outros agentes (usando `sub_agent_ids`).

**Alterações:**
- `ai-process-message/index.ts`: Adicionar tool `delegate_to_agent` ao ReACT loop. Quando invocada, chama recursivamente o ai-process-message com o sub-agente, passando a sub-tarefa como mensagem e `skip_send: true`. Retorna a resposta como tool_result.
- Limitar delegação a 1 nível de profundidade (sem recursão infinita).
- Respeitar budget do sub-agente e acumular custos no log principal.

### Fase 2: Structured Output para Skills
Forçar output JSON estruturado quando o agente executa tools que retornam dados.

**Alterações:**
- `ai-process-message/index.ts`: Após executar tools como `query_crm`, `check_payments`, `navigate_graph`, parsear o resultado e retornar JSON estruturado (não texto livre) ao LLM.
- Adicionar campo `output_schema` opcional ao `agent_skills` para definir o formato esperado de cada skill.
- Migration SQL: adicionar `output_schema JSONB` a `agent_skills`.

### Fase 3: Manager/Router Agent Mode
Modo "hierarchical" onde o agente default funciona como dispatcher.

**Alterações:**
- Adicionar campo `routing_mode` ao `ai_agents` (values: `direct` | `hierarchical`). Default: `direct`.
- Quando `hierarchical`: o agente recebe a mensagem, decide qual sub-agente deve responder, delega via `delegate_to_agent`, e opcionalmente revisa a resposta antes de enviar.
- `AgentFormDialog.tsx`: Adicionar selector de modo de routing quando o agente tem sub-agentes configurados.
- Migration SQL: `routing_mode TEXT DEFAULT 'direct'` em `ai_agents`.

### Fase 4: Human-in-the-Loop para Acções Críticas
Permitir que o agente peça confirmação antes de executar skills marcadas como "sensíveis".

**Alterações:**
- Migration SQL: adicionar `requires_confirmation BOOLEAN DEFAULT false` a `agent_skills`.
- `ai-process-message/index.ts`: Quando o ReACT loop quer executar uma skill com `requires_confirmation = true`, em vez de executar, retorna uma mensagem de confirmação e salva o estado pendente em `bot_state`.
- `flow-engine/index.ts`: Tratar resposta de confirmação ("sim"/"não") para executar ou cancelar a acção pendente.
- `AgentFormDialog.tsx`: Toggle "Requer confirmação" por skill.

### Ficheiros a Alterar/Criar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/ai-process-message/index.ts` | Delegation + structured output + HITL |
| Migration SQL | `output_schema` em `agent_skills`, `routing_mode` em `ai_agents`, `requires_confirmation` em `agent_skills` |
| `src/components/agentes/AgentFormDialog.tsx` | UI routing mode + confirmation toggle |
| `src/pages/Agentes.tsx` | Suporte aos novos campos |

### Prioridade
1. **Fase 1 (Delegation)** — desbloqueia colaboração multi-agente real
2. **Fase 2 (Structured Output)** — qualidade e fiabilidade das respostas
3. **Fase 3 (Manager Mode)** — routing inteligente automático
4. **Fase 4 (HITL)** — segurança para acções críticas

