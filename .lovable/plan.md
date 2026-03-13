

## Revisão Arquitetural — Fase 2 Implementada

### Mudanças realizadas (Fase 2)

#### 1. Código morto eliminado
- `chatbot-reply/index.ts` — **removido** (100% duplicado com flow-engine → ai-process-message)
- `ai-triage/index.ts` — **removido** (100% duplicado com ai-automation-agent action classify_lead)

#### 2. Janela de contexto expandida
- `RECENT_MSG_COUNT`: 5 → **15** mensagens recentes completas
- `HISTORY_LIMIT`: 15 → **30** mensagens totais
- TOON comprime as 15 mais antigas, mantém as 15 recentes intactas

#### 3. RAG semântico real (pgvector)
- Edge function `generate-embeddings` criada — gera embeddings de 768 dimensões via Lovable AI
- `parse-document` agora chama `generate-embeddings` automaticamente após chunking
- `ai-process-message` usa `match_chunks()` RPC para busca semântica (threshold 0.5)
- Fallback para keyword scoring quando embeddings não existem

#### 4. Router multi-agente
- Quando agente tem `sub_agent_ids`, classifica intenção via IA rápida (flash-lite)
- Delega para sub-agente especialista com seu próprio prompt e KB
- Mantém agente activo em `bot_state.active_sub_agent_id` para consistência

#### 5. Self-evaluation / Reflexão
- Após gerar resposta, avalia qualidade via flash-lite (score 1-10)
- Se score < 7, regenera com instrução de correcção (máximo 1 retry)
- Respostas < 50 chars ignoram avaliação

#### 6. Sentiment analysis + Auto-escalação
- Análise de sentimento via heurística + IA
- 2x frustração consecutiva → auto-transfere para humano
- Guarda sentiment em `bot_state.last_sentiment`
- Regista escalação em `conversation_feedback`

#### 7. Tools dinâmicas expandidas
- Novas tools: `search_knowledge`, `get_case_status`, `send_payment_link`
- Tools desconhecidas verificam `tool_parameters.webhook_url` para chamada webhook genérica
- Registry pattern: tools são lidas de `agent_tools` table

#### 8. Queue worker auto-trigger
- Trigger PostgreSQL `AFTER INSERT ON message_queue` chama `pg_net.http_post()` para queue-worker
- Cron backup via `pg_cron` a cada minuto

#### 9. Melhorias de robustez no sendReply
- `Promise.allSettled` para operações paralelas (save message + update conversation)
- Error logging real em vez de fire-and-forget silencioso para message-send e bitrix24-send
- Extração de memória com tolerância `count % 10 > 1` (mais robusto que `=== 0`)

### Mudanças realizadas (Fase 2.1 — Limpeza Final)

#### Código morto eliminado
- `chatbot-reply/index.ts` e `ai-triage/index.ts` — diretórios já removidos, agora limpas referências em `config.toml`, `ApiDocs.tsx` e `bitrix24-worker.ts`
- ApiDocs actualizado para documentar `ai-process-message` em vez de `chatbot-reply`

#### Sintaxe corrigida
- `parse-document/index.ts` — corrigida função `extractWithAI` que estava erroneamente aninhada dentro de `findFileInZip`

#### Config.toml actualizado
- Removidas entradas `ai-triage` e `chatbot-reply`
- Adicionadas entradas para `generate-embeddings`, `parse-document` e `queue-worker`

### Próximos passos
- Implementar dashboard de observabilidade no frontend
- Adicionar botões thumbs up/down no chat de atendimento
- Batch job para gerar embeddings dos chunks existentes
- Streaming no PlaygroundIA
