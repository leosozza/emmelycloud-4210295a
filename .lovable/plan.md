

## Revisão Arquitetural Completa do Sistema de Agentes IA

### Estado Atual — O que já existe

O sistema já implementa uma arquitetura de 3 camadas bem estruturada:

```text
Webhook (WhatsApp/Instagram)
        ↓
  Flow Engine (decisão/roteamento)
        ↓
  AI Process Message (IA + RAG)
```

**Pontos fortes existentes:**
- Pipeline unificado: `whatsapp-webhook` → `flow-engine` → `ai-process-message`
- Anti-loop com `processing_lock_at` (5s)
- Deduplicação de mensagens via `external_id`
- Deduplicação de respostas via hash
- TOON (Token Optimization): compressão de histórico antigo e KB em formato tabular (~40-50% economia)
- RAG funcional via `knowledge_chunks` com chunking e re-chunking
- Multi-provider: Lovable AI, Ollama/Qwen local, com fallback
- Treinamento por persona via linguagem natural (`persona-trainer`)
- Motor de fluxos híbrido com prioridade: Keyword → All Messages → Default Flow → AI livre
- Automação interna: classificação de leads, resumo de conversas, extração de dados, sugestão de ação

### Gaps Identificados vs. Arquitetura de Referência

Comparo com as 10 camadas que descreveste e identifico o que falta:

| Camada | Estado | Gap |
|--------|--------|-----|
| Interface (multi-canal) | ✅ WhatsApp, Instagram, Chat, Bitrix24 | — |
| Orquestrador | ✅ `flow-engine` + `chatbot-reply` | Duplicação de lógica entre `chatbot-reply` e `flow-engine` |
| LLM Layer | ✅ Multi-provider | — |
| RAG / Knowledge | ⚠️ Keyword search, sem vector search | **Sem embeddings/pgvector** — busca por `chunk_index` apenas |
| Tools / APIs | ⚠️ Webhook call no flow, tools na automação | **Sem tool-calling no chatbot** (o agente não executa ações) |
| Memória curta | ✅ `messages` table + 15 últimas | — |
| Memória longa | ❌ Não existe | **Sem `user_memory`** — a IA não lembra preferências entre sessões |
| Router multi-agente | ⚠️ `sub_agent_ids` e `routing_rules` existem na tabela mas não são usados | **Router agent não implementado** |
| Observabilidade | ❌ Não existe | **Sem métricas**: custo, latência, taxa de erro, satisfação |
| Feedback loop | ❌ Não existe | **Sem `conversation_feedback`** para melhoria contínua |
| Fila de mensagens | ⚠️ Lock básico de 5s | **Sem queue real**: sem retry, sem prioridade, sem debounce |

### Plano de Evolução — 6 Melhorias Prioritárias

#### 1. Vector Search com pgvector (RAG real)
**Problema**: A busca de chunks é por `chunk_index` sequencial — não há busca semântica.
- Habilitar extensão `pgvector` no database
- Adicionar coluna `embedding vector(768)` à tabela `knowledge_chunks`
- Criar função `match_chunks(query_embedding, match_count, threshold)` com `<=>` (cosine distance)
- No `parse-document`, gerar embedding de cada chunk via Lovable AI (modelo embedding)
- No `ai-process-message`, gerar embedding da pergunta do utilizador e buscar os top-N chunks mais similares em vez de buscar todos sequencialmente

#### 2. Tool Calling no Chatbot (agente que executa ações)
**Problema**: O chatbot apenas responde texto — não executa ações (criar lead, agendar, etc.).
- Definir tabela `agent_tools` (N:N entre `ai_agents` e tools disponíveis)
- No `ai-process-message`, quando o agente tem tools vinculados, enviar `tools[]` no payload da LLM
- Processar `tool_calls` na resposta: executar a ação (criar lead, consultar CRM, enviar email) e retornar resultado ao LLM para resposta final
- Tools iniciais: `create_lead`, `search_leads`, `check_payment_status`, `transfer_to_human`, `schedule_callback`

#### 3. Router Multi-Agente
**Problema**: `sub_agent_ids` e `routing_rules` existem no schema mas nunca são usados.
- Implementar nó `ai_router` no `flow-engine` que usa IA para classificar intenção e delegar
- Quando o agente tem `sub_agent_ids`, o `ai-process-message` primeiro classifica a intenção e redireciona para o agente especialista
- Agentes especializados: Vendas, Suporte, Financeiro, Técnico — cada um com seu próprio prompt e knowledge base

#### 4. Memória Longa (`user_memory`)
**Problema**: A IA não lembra informações do utilizador entre conversas diferentes.
- Criar tabela `user_memory` (`user_id/contact_phone`, `key`, `value`, `updated_at`)
- No final de cada conversa, usar IA para extrair factos relevantes (nome, empresa, preferências) e salvar
- No início de cada conversa, carregar memória do contacto e incluir no system prompt
- Auto-manutenção: limpar memórias desatualizadas (>90 dias sem uso)

#### 5. Fila de Mensagens com Retry e Debounce
**Problema**: Lock de 5s é frágil — sem retry, sem agrupamento de mensagens rápidas.
- Criar tabela `message_queue` (`conversation_id`, `message`, `status`, `priority`, `attempts`, `created_at`, `processing_at`)
- No webhook, em vez de chamar `flow-engine` diretamente, inserir na fila
- Worker (cron Edge Function ou realtime trigger) processa a fila com:
  - Debounce de 2s (agrupar mensagens consecutivas)
  - Lock por `conversation_id`
  - Retry automático (3 tentativas com backoff)
  - Prioridade (humano aguardando > cliente premium > geral)

#### 6. Observabilidade e Feedback
**Problema**: Zero métricas sobre a qualidade da IA.
- Criar tabela `ai_usage_logs` (`conversation_id`, `agent_id`, `model`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `cost_estimate`, `created_at`)
- Criar tabela `conversation_feedback` (`conversation_id`, `rating`, `issue_type`, `resolved`, `created_at`)
- No `ai-process-message`, salvar `usage` em `ai_usage_logs` após cada chamada
- No frontend (Atendimento), adicionar botões de thumbs up/down para feedback
- Dashboard de IA: custo total, tempo médio de resposta, taxa de fallback, perguntas sem resposta

### Eliminação de Código Duplicado

**`ai-triage`** é 100% duplicado com `ai-automation-agent` (action `classify_lead`). Recomendo:
- Deprecar `ai-triage` e redirecionar para `ai-automation-agent`
- Manter um único ponto de entrada para automações IA

**`chatbot-reply`** duplica lógica do `flow-engine` + `ai-process-message`. Recomendo:
- Consolidar em `flow-engine` como ponto único de entrada
- Webhooks chamam `flow-engine` diretamente (já o fazem)

### Ordem de Implementação Recomendada

1. **Eliminar duplicações** (ai-triage, chatbot-reply) — limpeza imediata
2. **Observabilidade** (ai_usage_logs) — fundação para medir melhorias
3. **Fila de mensagens** — estabilidade em produção
4. **Vector search / pgvector** — salto qualitativo no RAG
5. **Tool calling no chatbot** — agente que age
6. **Memória longa + Router multi-agente** — personalização avançada

