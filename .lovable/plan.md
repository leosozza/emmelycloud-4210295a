## Análise: Repos top de claude-code-skills aplicáveis ao Emmely

A maioria dos 882 repos do tópico é para coding agents (Cursor, Codex, Claude Code) — **não se aplica** ao Emmely (CRM jurídico SaaS, não IDE). Filtrei os 4 com padrões realmente transferíveis:

| Repo | ★ | Padrão útil para Emmely |
|------|---|--------------------------|
| **wshobson/agents** | 35k | Sub-agents especializados + slash-commands |
| **alirezarezvani/claude-skills** | 14k | Skills por vertical (compliance, legal, marketing) |
| **parcadei/Continuous-Claude-v3** | 3.8k | Context ledgers + handoffs entre agentes |
| **ruvnet/ruflo** (já analisado) | 50k | Multi-runtime, federation, witness audit |

### O que NÃO aplicar (anti-recomendações)
- Marketplace/installer CLI de skills — somos SaaS fechado, não há instalação local.
- WASM sandbox / Anthropic Managed Agents — overkill agora.
- Hooks de IDE / VSCode extension — fora do nosso form factor.
- "Vibe coding" templates / PRDs — não é o nosso caso de uso.

---

## Recomendação consolidada — 3 evoluções com ROI alto

### Evolução 1 — Skills System por vertical (inspirado em alirezarezvani + wshobson)

**Problema atual:** `system_prompt` monolítico por agente. Para criar "Thalia Cordeiro especialista em Direito de Família", repete-se prompt enorme. Não há reuso.

**Solução:** Tabela `agent_skills` com fragmentos especializados que podem ser combinados.

```sql
agent_skills (
  id uuid pk, name text, vertical text,  -- 'legal_family','legal_labor','collection','triage','booking'
  description text, prompt_fragment text,
  allowed_tools text[],                     -- whitelist (sem wildcards)
  required_knowledge_collection_ids uuid[], -- vincula a knowledge_documents
  is_global bool, created_by uuid
)
agent_skill_links (agent_id, skill_id, priority int)
```

**Skills iniciais (seed) — verticais reais do Emmely:**
- `triagem_juridica` — classifica área + viabilidade (já temos lógica, vira skill)
- `direito_familia` — divórcio, pensão, guarda
- `direito_trabalho` — rescisão, FGTS, horas extras
- `cobranca_amigavel` — tom empático, regras de juros (10% multa + 1%/mês)
- `agendamento_consulta` — usa Booking API do Bitrix
- `qualificacao_lead_24h` — SLA crítico, escalação
- `pos_venda_pagamento` — confirma recebimento, envia comprovativo

**UI:** aba "Skills" no `AgentFormDialog` (badges toggleáveis, igual ao `BitrixUserLink` que acabámos de fazer). System prompt final é montado em runtime por `agent-runtime`.

**Ganho:** Thalia Cordeiro = `[direito_familia, direito_trabalho, agendamento_consulta]`. Outro agente reusa as mesmas skills sem duplicar prompt.

---

### Evolução 2 — Context Ledger entre agentes (inspirado em Continuous-Claude-v3)

**Problema atual:** Quando agente A delega para B (ou utilizador transfere conversa para humano), o contexto perde-se. Hoje só temos `ai_usage_logs` em modo append-only sem visão consolidada.

**Solução:** "Ledger" persistido por conversa = handoff resumido + estado.

```sql
conversation_ledger (
  conversation_id uuid pk fk,
  current_agent_id uuid, current_human_id uuid,
  summary text,             -- resumo curto (gerado por IA a cada 10 msgs)
  open_intents jsonb,       -- ["agendar_consulta", "confirmar_pagamento"]
  collected_facts jsonb,    -- {nome, area, valor_causa, urgencia}
  blockers jsonb,           -- ["falta_documento_x"]
  next_action text,
  updated_at timestamptz
)
conversation_handoffs (
  id uuid, conversation_id uuid, from_actor jsonb, to_actor jsonb,
  reason text, snapshot jsonb, created_at timestamptz
)
```

**Mecânica:**
- Trigger gera/atualiza `summary` e `collected_facts` a cada N mensagens (Edge Function `ledger-update`).
- Em vez de mandar 200 msgs ao LLM, mandamos `system + ledger.summary + last 10 msgs`. **Reduz tokens 80–90%** em conversas longas.
- Handoff (IA → humano, agente A → B, transferência entre filiais) escreve snapshot — humano abre conversa e vê resumo + factos + bloqueios no `ContactProfile`.

**Ganho:** custo IA cai drasticamente, transferências param de "perder o contexto" (queixa comum em call centers).

---

### Evolução 3 — Slash-commands no Atendimento (inspirado em wshobson/agents)

**Problema atual:** Operadores humanos têm de digitar manualmente respostas comuns; não há atalhos para invocar skills do agente sob demanda.

**Solução:** No `ChatInput.tsx`, digitar `/` abre paleta de comandos:
- `/resumir` — resume conversa atual (chama `summarize_conversation` que já existe)
- `/qualificar` — roda triagem IA no lead vinculado
- `/cobrar 1500` — gera link Stripe e envia
- `/agendar amanha 14h` — cria evento Bitrix Booking
- `/proposta divorcio` — gera proposta a partir de template
- `/transferir thalia` — handoff para agente IA (escreve no ledger)
- `/traduzir pt-BR` — traduz última msg do cliente

**Implementação:** tabela `slash_commands` (configurável por admin), hook `useSlashCommands` que faz parse + dispatch. Reusa `quick_replies` que já existe mas adiciona ações executáveis (não só texto).

**Ganho:** operador 3× mais rápido, IA usada sob demanda em vez de só em modo autônomo.

---

## Ordem sugerida

1. **Evolução 2 (Ledger)** — maior ROI imediato (corta custo IA + resolve dor real de handoffs). Médio esforço.
2. **Evolução 1 (Skills)** — destrava todo o futuro (multi-vertical, agente Thalia bem treinado). Maior esforço.
3. **Evolução 3 (Slash commands)** — quick win UX após termos as skills/handoff prontos. Pequeno esforço.

Não recomendo fazer as 3 em paralelo — a Skills e o Ledger tocam em `ai-automation-agent` e `flow-engine`; conflitos garantidos.

---

## Detalhes técnicos resumidos

- **Edge functions novas:** `ledger-update` (trigger por nova msg), `agent-runtime` (despachador unificado que lê skills + ledger), `slash-command-execute`.
- **RLS:** skills globais leitura para autenticados; ledger por `conversation_id` segue policy existente da `conversations`.
- **Memory dependencies:** atualiza `mem://arquitetura/ia/consolidacao-logica-agentes` e cria `mem://arquitetura/ia/skills-e-ledger`.
- **Migrações de dados:** zero destrutivas — tudo aditivo. `system_prompt` atual continua a funcionar; skills são opt-in.

Confirma qual evolução queres começar (1, 2 ou 3), ou se queres que ajuste o plano antes?
