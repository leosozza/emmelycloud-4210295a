

## Análise Arquitetural Completa do Agente IA — Melhorias para Última Geração

### Diagnóstico do Estado Atual

O pipeline atual segue uma estrutura de 3 camadas funcional:

```text
Webhook (WhatsApp/Instagram/Bitrix24)
        ↓
  Flow Engine (roteamento + fluxos visuais)
        ↓
  AI Process Message (LLM + RAG + Tools + Memória)
```

**O que já funciona bem:**
- Pipeline unificado webhook → flow-engine → ai-process-message
- TOON (compressão tabular de KB e histórico antigo)
- Tool calling com 5 ferramentas (create_lead, search_leads, check_payment, transfer_human, schedule_callback)
- Memória longa via `user_memory` com extração automática a cada 10 mensagens
- Anti-loop (processing_lock), anti-repetição (hash), deduplicação
- Observabilidade básica via `ai_usage_logs`
- Queue worker com debounce de 2s e retry
- Multi-provider (Lovable AI, Ollama/Qwen)

---

### 12 Problemas Críticos Identificados

| # | Problema | Impacto | Severidade |
|---|---------|---------|------------|
| 1 | **RAG sem embeddings reais** — busca por keyword scoring, não semântica. A coluna `embedding` existe mas nunca é preenchida | Respostas imprecisas quando KB é grande | CRÍTICO |
| 2 | **`chatbot-reply` ainda existe** — duplica 100% do flow-engine + ai-process-message | Código morto, confusão de pipeline | ALTO |
| 3 | **`ai-triage` ainda existe** — duplica `classify_lead` do ai-automation-agent | Código morto | ALTO |
| 4 | **RECENT_MSG_COUNT = 5** — apenas 5 mensagens recentes como contexto real, 10 antigas comprimidas. Total 15. Agentes modernos usam 30-50 | Perda de contexto em conversas longas | ALTO |
| 5 | **Router multi-agente não implementado** — `sub_agent_ids` e `routing_rules` existem no schema mas zero código os usa | Todos os tópicos vão para o mesmo agente | ALTO |
| 6 | **Sem reflexão/auto-avaliação** — a IA responde numa passagem única sem validar qualidade | Respostas de baixa qualidade passam | MÉDIO |
| 7 | **Memória longa frágil** — extração apenas a cada exato `count % 10 === 0`, depende de parsing JSON de texto livre, sem `onConflict` composite correto | Memórias perdidas | MÉDIO |
| 8 | **Sem streaming** — respostas do chat interno (PlaygroundIA) não usam streaming | UX lenta para respostas longas | MÉDIO |
| 9 | **Tools hardcoded** — as 5 tools estão no código, não são dinâmicas pela tabela `agent_tools` | Não escalável | MÉDIO |
| 10 | **Queue worker não é invocado automaticamente** — precisa de trigger/cron externo | Fila acumula sem processamento | ALTO |
| 11 | **Sem sentiment analysis** — não detecta frustração do cliente para escalar | Clientes irritados ficam com bot | MÉDIO |
| 12 | **`sendReply` faz fire-and-forget** para Bitrix24 e message-send sem error handling | Mensagens perdidas silenciosamente | MÉDIO |

---

### Plano de Melhorias — 8 Ações Prioritárias

#### 1. Implementar RAG Semântico Real (pgvector)
- Criar edge function `generate-embeddings` que usa Lovable AI para gerar embeddings de cada chunk existente
- No `parse-document`, após chunking, chamar `generate-embeddings` automaticamente
- No `ai-process-message`, substituir keyword scoring por `match_chunks()` RPC (já existe a SQL function)
- Usar modelo `google/gemini-2.5-flash-lite` para gerar query embedding antes da busca

#### 2. Eliminar Código Morto
- Remover `chatbot-reply/index.ts` — todo o roteamento já passa por `flow-engine`
- Remover `ai-triage/index.ts` — funcionalidade 100% coberta por `ai-automation-agent` action `classify_lead`
- Actualizar referências no frontend (`useAiTriage.ts` já foi migrado)

#### 3. Expandir Janela de Contexto
- Aumentar `RECENT_MSG_COUNT` de 5 para 15 (mensagens recentes completas)
- Aumentar limite de histórico de 15 para 30
- Usar TOON para as 15 mais antigas, manter as 15 recentes intactas
- Resultado: ~30 mensagens de contexto vs. 15 actuais

#### 4. Implementar Router Multi-Agente
- No `ai-process-message`, quando agente principal tem `sub_agent_ids`, fazer classificação de intenção antes de responder
- Usar IA rápida (`gemini-2.5-flash-lite`) para classificar: "vendas", "suporte", "financeiro", "técnico", "geral"
- Redirecionar para o sub-agente especialista com seu próprio prompt e knowledge base
- Guardar agente activo no `bot_state` para manter consistência na conversa

#### 5. Adicionar Reflexão/Auto-Avaliação
- Após gerar resposta, fazer uma segunda chamada rápida (flash-lite) para avaliar: "Esta resposta está correcta, completa e adequada ao tom? Score 1-10"
- Se score < 6, regenerar com instrução de correcção
- Máximo 1 retry para não aumentar latência excessivamente

#### 6. Tornar Tools Dinâmicas
- Ler `agent_tools` da base de dados (já é feito) mas mapear `tool_name` para funções executáveis via registry pattern
- Adicionar novas tools: `search_knowledge` (busca semântica), `get_case_status`, `create_proposal`, `send_payment_link`
- Permitir que tools customizadas chamem webhooks externos (reuso do padrão `webhook_call` do flow-engine)

#### 7. Activar Queue Worker Automaticamente
- Criar trigger PostgreSQL `AFTER INSERT ON message_queue` que chama `pg_net.http_post()` para invocar `queue-worker`
- Alternativa: usar `pg_cron` para invocar queue-worker a cada 3 segundos
- Garantir idempotência no worker

#### 8. Adicionar Sentiment Analysis + Auto-Escalação
- No `ai-process-message`, após receber mensagem do cliente, classificar sentimento (positivo/neutro/negativo/frustrado)
- Se "frustrado" detectado 2x consecutivas → auto-transferir para humano
- Guardar sentiment no `conversation_feedback` para analytics

---

### Ficheiros a Criar/Editar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/generate-embeddings/index.ts` | **Criar** — gera embeddings para chunks via Lovable AI |
| `supabase/functions/ai-process-message/index.ts` | **Editar** — RAG semântico, router, reflexão, context window, sentiment |
| `supabase/functions/chatbot-reply/index.ts` | **Eliminar** |
| `supabase/functions/ai-triage/index.ts` | **Eliminar** |
| `supabase/functions/queue-worker/index.ts` | **Editar** — auto-invocação |
| Migration SQL | **Criar** — trigger para auto-invocar queue-worker, índice GIN em embeddings |

### Ordem de Implementação

1. Eliminar código morto (chatbot-reply, ai-triage)
2. Expandir janela de contexto (5→15 recentes)
3. RAG semântico (generate-embeddings + match_chunks)
4. Router multi-agente
5. Tools dinâmicas expandidas
6. Reflexão + sentiment analysis
7. Auto-trigger do queue worker

