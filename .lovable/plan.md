

## Auditoria Arquitetural Completa — Agente IA Emmely Cloud

### Estado Atual vs. Arquitetura Recomendada

A arquitetura atual já implementa **~80%** do que foi descrito nas recomendações. Abaixo está o mapeamento exacto do que existe, o que falta, e o que precisa de melhorias.

---

### O que JÁ ESTÁ implementado e funcional

| Camada | Componente | Estado |
|--------|-----------|--------|
| **Orquestração** | Router multi-agente com classificação de intenção via tool calling | Implementado |
| **Orquestração** | Pipeline 3 camadas: Webhook → Flow Engine → AI Processor | Implementado |
| **Orquestração** | Detecção de mudança de tópico para re-routing | Implementado |
| **RAG** | pgvector com `match_chunks` RPC (768 dim) | Implementado |
| **RAG** | Fallback keyword → sequential quando sem embeddings | Implementado |
| **Memória curta** | 30 mensagens (15 recentes + 15 comprimidas TOON) | Implementado |
| **Memória longa** | `user_memory` com extração automática via IA | Implementado |
| **Fila** | `message_queue` com debounce, retry, prioridade, pg_trigger | Implementado |
| **Tools** | Registry dinâmico via `agent_tools` + webhook fallback | Implementado |
| **Observabilidade** | `ai_usage_logs` (tokens, latência, custo, fallback) | Implementado |
| **Feedback** | `conversation_feedback` com auto-escalação por frustração | Implementado |
| **Reflexão** | Self-evaluation com score 1-10, retry se < 7 | Implementado |
| **Sentiment** | Análise heurística + IA, 2x frustração → transfere humano | Implementado |
| **Anti-loop** | Processing lock (5s), dedup hash, anti-repetição | Implementado |
| **Multi-provider** | Lovable AI, Ollama/Qwen, providers customizados | Implementado |

---

### Gaps Identificados — O que FALTA ou precisa de melhoria

#### 1. CRÍTICO — `ai-process-message` é um monólito de 1082 linhas
O ficheiro concentra: RAG, routing, sentiment, tools, self-eval, memory extraction, envio de mensagens. Qualquer alteração tem risco de quebrar funcionalidades adjacentes. Sem interfaces/contratos claros entre camadas.

**Melhoria:** Refactoring em módulos internos lógicos. Como Edge Functions Deno não suportam imports locais facilmente, a solução é reorganizar com secções bem delimitadas e extrair funções helper para blocos nomeados claros. Alternativa: criar edge functions auxiliares (`ai-tools-executor`, `ai-memory-manager`) chamadas internamente.

#### 2. IMPORTANTE — Sem dashboard de observabilidade no frontend
Os dados existem em `ai_usage_logs` e `conversation_feedback` mas não há UI para visualizá-los. Não há métricas de:
- Custo por conversa/agente
- Tempo médio de resposta
- Taxa de fallback
- Taxa de auto-escalação
- Thumbs up/down por mensagem

**Melhoria:** Criar página ou tab de "Observabilidade IA" com gráficos de tokens, latência, custos e feedback agregado.

#### 3. IMPORTANTE — Feedback thumbs up/down não implementado
A tabela `conversation_feedback` existe mas não há UI no chat de atendimento para o utilizador dar thumbs up/down em respostas individuais do bot.

**Melhoria:** Adicionar botões de feedback em cada mensagem outbound do bot no painel de atendimento.

#### 4. MODERADO — Embeddings gerados via prompt LLM (não via embedding API)
A função `semanticSearch` pede ao LLM para "gerar um array JSON de 768 floats" — isto é frágil, lento e inconsistente. Embeddings reais devem vir de uma API de embeddings dedicada (ex: `/v1/embeddings`).

**Melhoria:** Verificar se o Lovable AI Gateway suporta endpoint `/v1/embeddings`. Se não, manter o approach actual mas adicionar cache dos embeddings de query (queries frequentes).

#### 5. MODERADO — `extractUserMemory` tem lógica de frequência frágil
`count % 10 > 1` significa que extrai memória apenas quando count é múltiplo de 10 ou 10+1. Pode perder contexto importante.

**Melhoria:** Extrair memória em momentos-chave (fim de conversa, transferência humana, após N mensagens novas) em vez de modulo aritmético.

#### 6. MENOR — Sem cost estimation real em `ai_usage_logs`
O campo `cost_estimate` está sempre a 0. Não há cálculo de custo baseado nos tokens consumidos.

**Melhoria:** Adicionar tabela de preços por modelo e calcular custo estimado no `logUsage`.

#### 7. MENOR — Sem retry/circuit breaker no AI gateway
Se o Lovable AI Gateway retornar 429/502, a resposta falha imediatamente sem retry. O `ai-automation-agent` trata 429 mas o `ai-process-message` não.

**Melhoria:** Adicionar retry com backoff exponencial (1 retry, 2s delay) no `ai-process-message`.

---

### Plano de Implementação (por prioridade)

| # | Melhoria | Ficheiros | Esforço |
|---|----------|-----------|---------|
| 1 | **Dashboard Observabilidade IA** — nova página com KPIs: tokens totais, custo estimado, latência média, taxa fallback, top agentes, feedback rating | Nova página `src/pages/ObservabilidadeIA.tsx`, hook `useAiObservability.ts` | Alto |
| 2 | **Thumbs up/down no chat** — botões em cada mensagem bot no Atendimento, salva em `conversation_feedback` com `message_id` | `src/components/atendimento/MessageBubble.tsx` | Médio |
| 3 | **Retry com backoff no AI gateway** — 1 retry automático em 429/502 com 2s delay | `supabase/functions/ai-process-message/index.ts` | Baixo |
| 4 | **Cost estimation real** — lookup de preço por modelo, calcular no logUsage | `supabase/functions/ai-process-message/index.ts` + migration para tabela `ai_model_pricing` | Médio |
| 5 | **Memory extraction melhorada** — extrair em eventos-chave (transferência, 15+ msgs novas) em vez de modulo | `supabase/functions/ai-process-message/index.ts` | Baixo |
| 6 | **Reorganizar ai-process-message** — separar em secções claras com comentários de bloco, extrair constantes | `supabase/functions/ai-process-message/index.ts` | Médio |

### Resumo

A arquitectura está **sólida e avançada** — implementa correctamente as 9 camadas recomendadas (orquestração, RAG, multi-agente, memória curta/longa, fila, tools, feedback, reflexão, observabilidade de backend). Os gaps principais são na **camada de apresentação** (falta dashboard de métricas e feedback UI) e em **robustez operacional** (retry, cost tracking, modularização do monólito).

