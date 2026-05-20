
# Plano: Evolução IA/Flows inspirada em ChatDev (OpenBMB)

## 1. O que é o ChatDev e o que vale a pena copiar

ChatDev é um framework multi-agente onde "empresa virtual" (CEO, CPO, CTO, Programador, Revisor, Tester, Designer) constrói software em **fases sequenciais** (Design → Coding → Testing → Documenting) através de uma **Chat Chain**: cada fase = diálogo curto entre 2 papéis (instrutor ↔ executor) com objetivo único e critério de término claro.

Conceitos que valem ouro para a Emmely:

| Conceito ChatDev | O que é | Aplicação Emmely |
|---|---|---|
| **Chat Chain** | Divide tarefa complexa em sub-diálogos atômicos sequenciais | Substitui prompts gigantes nos Crews por mini-conversas auditáveis |
| **Role Specialization** | Cada agente tem persona + responsabilidade restrita | Já temos Especialistas Jurídicos — falta formalizar protocolo de handoff |
| **Communicative Dehallucination** | Executor faz perguntas ao instrutor antes de agir quando há ambiguidade | Reduz invenções nas respostas a clientes e nos extratores de lead |
| **Instructor/Assistant duality** | Mesmo agente alterna papéis para auto-revisão | Auto-QA antes de enviar mensagem ao cliente |
| **Memory Stream (curta + longa)** | Memória da fase atual + sumário cross-fase | Complementa o Conversation Ledger atual |
| **Self-Reflection no fim de cada fase** | Revisor gera crítica + score, e se < threshold, refaz | Quality gate antes de enviar proposta/cobrança |
| **Thought Instruction** | Pensamento explícito antes da ação (ReACT estruturado) | Já temos ai_usage_logs ReACT — falta gate de qualidade |

## 2. Diagnóstico do estado atual

Pontos fortes existentes:
- `ai_crews` + `ai_tasks` + `ai-crew-executor` (modos sequential e consensual)
- Pipeline unificado chatbot com lock anti-loop
- Conversation Ledger (reduz tokens 80-90%)
- Agentes Especialistas roteáveis
- Motor de regras determinístico pré-fluxo
- ReACT audit trail em `ai_usage_logs`
- HITL em ferramentas críticas

Lacunas vs ChatDev:
1. **Crews executam tarefas isoladas**, não uma "chain" com fase de revisão obrigatória.
2. **Sem dehallucination protocol** — agentes respondem mesmo com dados incompletos (ex.: extrator de lead inventa nome).
3. **Sem self-reflection automático** entre fases (proposta gerada vai direto ao cliente sem QA de IA).
4. **Roteamento entre especialistas** é reativo (mudança de tópico) — falta um "CEO/Orquestrador" que decida proativamente a sequência de especialistas necessária para resolver o caso.
5. **Flows** disparam sub-flows mas não têm "quality gate" nem rollback semântico.
6. **Memória** é boa por conversa, mas não há **memória episódica de casos similares** (RAG sobre conversas anteriores do mesmo tipo de causa).
7. **Sem versionamento de prompts/personas** — impossível A/B test ou rollback de personalidade.

## 3. Arquitetura proposta — "Emmely Chat Chain"

```text
┌──────────────────────────────────────────────────────────┐
│  ORQUESTRADOR (CEO virtual — novo agente "manager")      │
│  Decide: que cadeia de especialistas + tarefas executar  │
└────────────┬─────────────────────────────────────────────┘
             │
   ┌─────────┴──────────┐
   │  CHAT CHAIN ENGINE │  (extensão do ai-crew-executor)
   └─────────┬──────────┘
             │
   Fase 1 ──▶ Fase 2 ──▶ Fase 3 ──▶ Fase 4
   Triagem    Análise     Ação      Revisão
   (Atendente)(Especialista)(Ferramenta)(QA Agent)
        │         │            │           │
        ▼         ▼            ▼           ▼
   Dehallucination check em cada fase (instructor↔assistant)
        │
        ▼
   Quality Gate (score ≥ threshold) ──► entrega
        │
        └──► se < threshold: re-run fase OR escalonar HITL
```

## 4. Entregáveis (em ordem de prioridade)

### Fase A — Fundação (alto ROI, baixo risco)
1. **Tabela `ai_chains`** (substitui o conceito atual de "crew com tasks soltas"):
   - `phases jsonb` (lista ordenada: `{role, goal, success_criteria, max_turns, requires_review}`)
   - `quality_threshold` (0-1)
   - `on_failure` (`retry` | `escalate` | `abort`)
2. **Tabela `ai_phase_executions`** — log por fase (input, output, score, turns usados, dehallucination flags).
3. **Edge function `ai-chain-executor`** — refatorar `ai-crew-executor`:
   - Loop por fase
   - Mini-conversa instrutor↔assistente até `success_criteria` ou `max_turns`
   - Chamada ao Reviewer Agent ao final de cada fase
   - Rollback de fase ou re-execução se score baixo

### Fase B — Dehallucination Protocol
4. **System prompt comum injetado** em todos agentes:
   > "Antes de afirmar qualquer fato sobre o cliente, contrato, valor ou prazo, verifique no contexto fornecido. Se não estiver presente, faça UMA pergunta de esclarecimento usando a ferramenta `ask_clarification` em vez de inventar."
5. **Nova ferramenta `ask_clarification`** que pausa o fluxo (estado `waiting_for_reply`, já existe) e envia pergunta ao operador OU ao cliente conforme `governance_mode`.
6. **Métrica `hallucination_score`** em `ai_usage_logs` (regex/JSON-check sobre campos críticos: valores, datas, nomes).

### Fase C — Quality Gate / Reviewer Agent
7. **Agente "Revisor Jurídico"** (persona dedicada) com tools read-only que pontua:
   - Coerência factual (compare com `clients`, `proposals`, `financial_records`)
   - Tom (vs `communication_style` do agente)
   - Compliance (LGPD/RGPD, ausência de promessas de resultado)
8. **Hook obrigatório** antes de qualquer `message-send` originado por IA: passa pelo Revisor; se score < 0.75 → reescreve ou solicita HITL.

### Fase D — Orquestrador (CEO virtual)
9. **Agente "Orquestrador"** que recebe nova conversa/lead e gera **dinamicamente** uma `ai_chain` (sequência: Triagem → Especialista X → Cálculo Financeiro → Geração de Proposta → Revisor).
10. **Substituir** roteamento por palavra-chave dos especialistas pelo Orquestrador (mantendo fallback).

### Fase E — Flows + Chain
11. **Novo nó "AI Chain"** no Flow Editor — operador desenha o fluxo determinístico, e em qualquer ponto pluga uma chain de IA com fases definidas visualmente.
12. **Quality gate em sub-flows**: cada sub-flow retorna `confidence`; flow pai decide ramificação.
13. **Rollback semântico**: se chain falha, flow restaura estado anterior do `ledger` e `bot_state`.

### Fase F — Memória episódica (RAG sobre casos)
14. **Tabela `case_episodes`**: cada caso encerrado vira embedding-free FTS (alinhado com a política atual de PostgreSQL FTS nativo) com tags `area`, `outcome`, `resolution_steps`.
15. **Ferramenta `recall_similar_case`** disponível a todos especialistas — devolve 3 casos análogos com decisão tomada.

### Fase G — Governança e observabilidade
16. **Versionamento de personas/prompts**: tabela `ai_agent_versions`, ativação via flag, A/B test por hash de conversation_id.
17. **Dashboard "Chain Health"**: por chain, mostrar taxa de quality-gate pass, dehallucination flags, custo médio, tempo médio.
18. **Replay de chain** na Observabilidade IA: reexecuta uma chain real com persona/prompt nova para comparar output (regression test).

## 5. Mapeamento direto ao código existente

| Arquivo/Tabela | Mudança |
|---|---|
| `supabase/functions/ai-crew-executor` | Renomear/refatorar para `ai-chain-executor` (mantém compat) — adiciona loop instrutor/assistente e reviewer hook |
| `supabase/functions/ai-process-message` | Injeta dehallucination prompt; expõe nova tool `ask_clarification` |
| `supabase/functions/message-send` | Antes do envio, se `source = ai`, chama Reviewer; bloqueia se score baixo |
| `ai_agents` table | + colunas `version`, `is_active_version`, `parent_agent_id` |
| Nova tabela `ai_chains` | Definição declarativa de fases |
| Nova tabela `ai_phase_executions` | Audit por fase |
| Nova tabela `case_episodes` | Memória episódica FTS |
| `src/pages/Flows.tsx` + `CustomFlowNode.tsx` | Novo tipo de nó "AI Chain" com seletor de chain pré-definida |
| `src/pages/ObservabilidadeIA.tsx` | Aba "Chain Health" + replay |
| `src/components/agentes/` | UI de versionamento e diff de prompts |

## 6. Roll-out sugerido

1. Sprint 1 (Fase A + B): chain engine + dehallucination — efeito imediato em qualidade.
2. Sprint 2 (Fase C): reviewer agent + quality gate antes de envio ao cliente.
3. Sprint 3 (Fase D + E): orquestrador + nó visual no Flow.
4. Sprint 4 (Fase F + G): memória episódica + versionamento + dashboards.

## 7. Riscos e mitigações

- **Latência extra** por reviewer → usar modelo `gemini-3.5-flash` ou `gpt-5.4-nano` no Revisor, modelo principal nos especialistas.
- **Loops de re-execução** → `max_retries=2` por fase; depois, escalonamento HITL automático.
- **Custo** → quality gate só obrigatório em ações de saída (mensagem ao cliente, criação de proposta, cobrança); interno fica opcional.
- **Compatibilidade** → manter `ai_crews` como view sobre `ai_chains` durante transição.

## 8. Perguntas em aberto (para refinar antes de implementar)

1. Quer começar pelo **Reviewer + Quality Gate** (impacto mais visível ao cliente) ou pelo **Chain Engine** (refator estrutural maior)?
2. O Orquestrador deve ser opt-in por conversa, ou substituir o roteamento por palavra-chave globalmente?
3. Memória episódica deve incluir conversas de **todos** os escritórios/filiais ou ficar isolada por `tenant`?
