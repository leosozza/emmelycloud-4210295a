

# Analise MiroFish vs EmmelyCloud — Conceitos Aplicaveis

## O que e o MiroFish

MiroFish e um motor de **inteligencia de enxame** (swarm intelligence) que simula cenarios futuros criando agentes IA com personalidades distintas, colocando-os a interagir numa rede social simulada, e depois analisando os resultados. Os conceitos-chave sao:

1. **Knowledge Graph com Zep** — constroi grafos de entidades/relacoes a partir de texto (documentos, noticias), que servem de "memoria colectiva"
2. **Memoria Temporal Dinamica** — cada agente tem memoria que se atualiza round a round (via `zep_graph_memory_updater`)
3. **ReACT Report Agent** — agente que gera relatorios usando um ciclo Think → Tool Call → Observe → Write, com ferramentas como `InsightForge` (pesquisa profunda), `PanoramaSearch` (visao ampla), e `Interview` (entrevistar agentes)
4. **Simulation IPC** — comunicacao inter-processos para entrevistar agentes apos a simulacao
5. **Ontologia** — extrai automaticamente tipos de entidades e relacoes do texto de entrada antes de construir o grafo

## O que e Aplicavel ao EmmelyCloud

O MiroFish e um sistema de simulacao social, nao um CRM. **Nao faz sentido** copiar a simulacao. Mas ha **3 padroes arquitecturais** que podem melhorar significativamente o EmmelyCloud:

### Conceito 1: Knowledge Graph para Agentes (ALTO IMPACTO)
Actualmente, o `ai-process-message` usa embeddings vectoriais simples (chunks de texto). O MiroFish mostra que **grafos de entidades** (cliente X → tem contrato Y → deve parcela Z) permitem respostas muito mais contextuais. Em vez do agente procurar "chunks similares", ele navega relacoes.

**Aplicacao pratica:** Quando um cliente pergunta "qual o estado do meu contrato?", o agente navega: Cliente → Contrato → Parcelas → Status, em vez de procurar chunks de texto.

### Conceito 2: ReACT Agent Loop (ALTO IMPACTO)
O `ai-process-message` actual e single-shot: recebe mensagem → chama LLM → responde. O MiroFish usa um ciclo **ReACT** (Reason → Act → Observe) onde o agente pode:
- Pensar sobre o que precisa
- Chamar uma ferramenta (consultar CRM, buscar dados)
- Observar o resultado
- Decidir se precisa de mais informacao ou se pode responder

**Aplicacao pratica:** O agente recebe "quero uma proposta para o servico X". Em vez de responder com texto generico, ele: (1) consulta servicos disponiveis, (2) busca dados do cliente no CRM, (3) gera a proposta automaticamente via skill.

### Conceito 3: Audit Trail Detalhado por Step (MEDIO IMPACTO)
O `ReportLogger` do MiroFish regista **cada passo** do agente em JSONL (thought, tool_call, tool_result, reflection). Actualmente o EmmelyCloud so regista o resultado final. Com logging por step, podemos debugar e optimizar o comportamento dos agentes.

**Aplicacao pratica:** Na Observabilidade IA, ver nao so "o agente respondeu em 3s" mas "pensou 0.5s → chamou CRM 1.2s → chamou KB 0.8s → respondeu 0.5s".

---

## Plano de Implementacao (3 fases)

### Fase 1: ReACT Agent Loop no `ai-process-message`
Transformar o `ai-process-message` de single-shot para um ciclo ReACT com ate 5 iteracoes.

**Alteracoes:**
- `ai-process-message/index.ts`: Implementar loop ReACT que define tools como funcoes JSON Schema, envia ao LLM, parseia `tool_calls` da resposta, executa a ferramenta, e re-envia o resultado ao LLM
- Ferramentas iniciais: `search_knowledge` (KB existente), `query_crm` (buscar lead/deal no Bitrix), `list_services` (listar servicos), `create_proposal_draft` (invocar proposal creation)
- Usar as `agent_skills` ja criadas para determinar quais ferramentas cada agente tem acesso
- Limite de 5 iteracoes para evitar loops infinitos

### Fase 2: Step-Level Audit Trail
Registar cada passo do agente (thought, tool_call, tool_result) na tabela `ai_conversation_logs`.

**Alteracoes:**
- Adicionar campo `step_details JSONB` a `ai_conversation_logs` (migration)
- No loop ReACT, acumular array de steps `[{type: "thought", content}, {type: "tool_call", tool, params}, {type: "tool_result", result}]`
- Gravar no log apos conclusao
- Na pagina de Observabilidade IA, adicionar expansao de cada log para ver os steps individuais

### Fase 3: Knowledge Graph Simplificado
Implementar um grafo de entidades simples usando a propria BD (sem Zep externo).

**Alteracoes:**
- Criar tabela `entity_graph` com colunas: `id`, `source_type` (lead/proposal/contract/service), `source_id`, `target_type`, `target_id`, `relation` (has_contract, owes_payment, interested_in), `metadata JSONB`
- Criar triggers que populam o grafo automaticamente quando leads, propostas, contratos sao criados/actualizados
- Adicionar ferramenta `navigate_graph` ao ReACT loop: dado um cliente, navegar relacoes para obter contexto completo
- Edge function `generate-embeddings` actualizada para tambem popular o grafo

### Ficheiros a Alterar/Criar

| Ficheiro | Accao |
|---|---|
| `supabase/functions/ai-process-message/index.ts` | ReACT loop + tool execution |
| Migration SQL | `step_details` em `ai_conversation_logs` + tabela `entity_graph` |
| `src/pages/ObservabilidadeIA.tsx` | Expansao de steps no log |
| `src/hooks/useAiObservability.ts` | Carregar step_details |

### Prioridade
1. **Fase 1 (ReACT)** — impacto imediato na qualidade das respostas dos agentes
2. **Fase 2 (Audit Trail)** — visibilidade para debugging
3. **Fase 3 (Knowledge Graph)** — contexto mais rico, implementacao mais complexa

