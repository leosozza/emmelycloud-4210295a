

## Revisão Arquitetural — Implementada

### Mudanças realizadas

#### 1. Eliminação de código duplicado
- `useAiTriage` agora chama `ai-automation-agent` (action: `classify_lead`) em vez do deprecated `ai-triage`
- `instagram-webhook` e `wuzapi-webhook` agora chamam `flow-engine` em vez de `chatbot-reply`

#### 2. Observabilidade (ai_usage_logs + conversation_feedback)
- Tabela `ai_usage_logs`: tokens, latência, custo, modelo, fallback, erro
- Tabela `conversation_feedback`: rating, issue_type, resolved
- `ai-process-message` salva automaticamente usage em cada chamada

#### 3. Fila de mensagens (message_queue + queue-worker)
- Tabela `message_queue` com status, prioridade, attempts, retry
- Edge Function `queue-worker` com debounce de 2s, lock por conversa, retry (3x)

#### 4. Vector search (pgvector)
- Extensão `pgvector` habilitada
- Coluna `embedding vector(768)` em `knowledge_chunks`
- Função `match_chunks(query_embedding, match_count, threshold)` com cosine distance
- `ai-process-message` usa keyword-scoring como ponte até embeddings serem gerados

#### 5. Tool calling no chatbot
- Tabela `agent_tools` (N:N agente ↔ tools)
- `ai-process-message` envia `tools[]` ao LLM quando agente tem tools
- Processa `tool_calls` e faz segunda chamada com resultados
- Tools: `create_lead`, `search_leads`, `check_payment_status`, `transfer_to_human`, `schedule_callback`

#### 6. Memória longa (user_memory)
- Tabela `user_memory` (contact_phone/instagram/email + key/value)
- `ai-process-message` carrega memórias no system prompt
- Extração automática a cada 10 mensagens via IA

### Próximos passos
- Gerar embeddings dos chunks existentes via batch job
- Implementar dashboard de observabilidade no frontend
- Adicionar botões thumbs up/down no chat de atendimento
- Implementar router multi-agente usando `sub_agent_ids`
