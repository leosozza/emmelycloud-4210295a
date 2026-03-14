

## Auditoria de Engenharia de IA — Falhas e Optimizações Identificadas

Após análise completa de todo o pipeline de IA (ai-process-message, flow-engine, queue-worker, generate-embeddings, message-send, whatsapp-webhook), identifiquei **12 falhas concretas** e oportunidades de optimização.

---

### FALHAS CRÍTICAS (impacto directo na qualidade das respostas)

#### 1. Embeddings falsos — LLM a gerar vectores em vez de embedding API real
**Ficheiros:** `generate-embeddings/index.ts` L73-91, `ai-process-message/index.ts` L475-486

O sistema pede ao LLM (flash-lite) para "gerar um array JSON de 768 floats" — isto **não é um embedding real**. Um LLM de texto não produz representações vectoriais semânticas consistentes. Os vectores são essencialmente aleatórios, tornando o `match_chunks` RPC praticamente inútil para busca semântica.

**Correcção:** Substituir por chamada ao endpoint `/v1/embeddings` do Lovable AI Gateway (se disponível) ou usar um modelo de embeddings dedicado. Se nenhum estiver disponível, remover a pretensão de "busca semântica" e usar apenas keyword search com BM25/TF-IDF, que é honesto e funcional.

#### 2. Self-evaluation desperdiça tokens sem impacto mensurável
**Ficheiro:** `ai-process-message/index.ts` L754-817

Cada resposta > 50 chars passa por uma chamada extra ao LLM para "avaliar qualidade 1-10". Problemas:
- O avaliador (flash-lite) é mais fraco que o modelo que gerou a resposta
- O critério de avaliação é genérico — não tem acesso ao KB nem ao contexto do agente
- Se score < 7, regenera **sem** o contexto de tools/RAG, produzindo respostas potencialmente piores
- Custo: ~2x tokens por mensagem processada

**Correcção:** Remover self-evaluation por defeito. Torná-la opt-in por agente (`enable_self_eval: boolean`). Quando activa, incluir o KB e contexto na avaliação.

#### 3. Memory extraction com `catch(() => {})` silencia todos os erros
**Ficheiro:** `ai-process-message/index.ts` L1069-1070, L1138, L1142

```typescript
extractUserMemory(...).catch(e => console.error(...));
// ... mas internamente:
} catch {} // L1142 — silencia TUDO
```

Se a extracção de memória falhar (API down, parsing error, DB error), o sistema nunca sabe. A memória de longo prazo pode estar completamente vazia sem ninguém perceber.

**Correcção:** Logar erros em `ai_usage_logs` ou `bitrix24_debug_logs` com `event_type: "memory_extraction_error"`.

---

### FALHAS IMPORTANTES (robustez e fiabilidade)

#### 4. Race condition no processing lock (flow-engine)
**Ficheiro:** `flow-engine/index.ts` L47-63

O lock é verificado com `SELECT` e adquirido com `UPDATE` separados — duas operações não-atómicas. Em alta concorrência, duas invocações podem ambas passar o check e adquirir o lock.

**Correcção:** Usar `UPDATE ... WHERE processing_lock_at IS NULL OR processing_lock_at < now() - interval '5 seconds' RETURNING id` como operação atómica.

#### 5. Tool call follow-up sem retry
**Ficheiro:** `ai-process-message/index.ts` L399-417

O follow-up call após tool execution (L399) não tem retry. Se o LLM falhar nesta segunda chamada, o utilizador recebe a resposta bruta do primeiro call (que pode ser vazia ou apenas tool_calls).

**Correcção:** Aplicar o mesmo padrão de retry usado no call principal (L346-357).

#### 6. Business Rules avaliadas em CADA mensagem — sem cache
**Ficheiro:** `flow-engine/index.ts` L120-126

A cada mensagem, o sistema faz `SELECT * FROM business_rules WHERE is_active = true` — sem cache. Com 100+ regras e tráfego alto, isto é uma query desnecessária por mensagem.

**Correcção:** Cache as regras em memória (Map) com TTL de 60 segundos no contexto da invocação. Como Edge Functions reutilizam workers, o cache persiste entre requests.

#### 7. Queue worker não marca jobs "grouped" como completed
**Ficheiro:** `queue-worker/index.ts` L87-92

Jobs agrupados são marcados como `status: "grouped"` mas nunca transitam para `completed`. Ao longo do tempo, a tabela acumula registos em estado terminal não-standard que podem confundir dashboards e contagens.

**Correcção:** Marcar jobs grouped como `completed` em vez de `grouped`, ou adicionar `grouped` como estado terminal explícito nos filtros de limpeza.

---

### FALHAS MODERADAS (performance e custo)

#### 8. Keyword search carrega 100 chunks na memória para scoring
**Ficheiro:** `ai-process-message/index.ts` L541-557

O fallback de keyword search carrega até 100 chunks e faz scoring em JavaScript — ineficiente para bases de conhecimento grandes. Além disso, chama o LLM só para extrair 5 palavras-chave.

**Correcção:** Usar `to_tsvector/to_tsquery` nativo do PostgreSQL via RPC para full-text search. Eliminar a chamada LLM para extracção de keywords (usar tokenização simples).

#### 9. Chatbot channel settings consultado 2x no ai-process-message
**Ficheiro:** `ai-process-message/index.ts` L100-104 e L121

A tabela `chatbot_channel_settings` é consultada duas vezes: uma para verificar se está enabled (L100) e outra para obter o `agent_id` (L121). São duas queries quando uma bastava.

**Correcção:** Combinar numa única query `select("enabled, agent_id")` e reutilizar o resultado.

#### 10. sendReply cria novo Supabase client desnecessariamente
**Ficheiro:** `ai-process-message/index.ts` L1014

```typescript
async function sendReply(...) {
  const supabase = createClient(supabaseUrl, serviceKey); // novo client!
```

O handler principal já tem um client criado em L69. Não há razão para criar outro.

**Correcção:** Passar o cliente existente como parâmetro.

#### 11. Anti-repetição usa hash fraco de 32 bits
**Ficheiro:** `ai-process-message/index.ts` L28-36

`simpleHash` usa bit shift de 32 bits — alta probabilidade de colisão. Duas mensagens diferentes podem produzir o mesmo hash, bloqueando respostas legítimas.

**Correcção:** Usar `crypto.subtle.digest("SHA-256", ...)` disponível em Deno, ou comparar strings directamente (as mensagens têm < 5KB).

#### 12. Observabilidade não rastreia chamadas auxiliares ao LLM
**Ficheiro:** `ai-process-message/index.ts`

O `logUsage` regista apenas a chamada principal. As chamadas auxiliares (sentiment analysis L734, router L598, keyword extraction L523, self-evaluation L763, memory extraction L1108, topic change detection) são invisíveis. O custo real pode ser 3-5x superior ao reportado.

**Correcção:** Adicionar `logUsage` para cada chamada auxiliar ao LLM, ou acumular tokens de todas as chamadas num único log entry.

---

### Plano de Implementação (por prioridade)

| # | Falha | Impacto | Ficheiros | Esforço |
|---|-------|---------|-----------|---------|
| 1 | **Embeddings falsos** — substituir LLM por FTS real | Crítico | `generate-embeddings`, `ai-process-message` | Alto |
| 2 | **Self-eval opt-in** — desactivar por defeito, opt-in por agente | Crítico (custo) | `ai-process-message`, migration `ai_agents` | Baixo |
| 3 | **Errors silenciados** — logar erros de memory extraction | Crítico (ops) | `ai-process-message` | Baixo |
| 4 | **Race condition lock** — UPDATE atómico | Importante | `flow-engine` | Baixo |
| 5 | **Tool follow-up retry** — aplicar retry pattern | Importante | `ai-process-message` | Baixo |
| 6 | **Cache business rules** — TTL 60s | Importante | `flow-engine` | Baixo |
| 7 | **Jobs grouped → completed** | Moderado | `queue-worker` | Baixo |
| 8 | **FTS nativo PostgreSQL** — substituir keyword search | Moderado | `ai-process-message`, migration | Médio |
| 9 | **Query duplicada channel_settings** | Moderado | `ai-process-message` | Baixo |
| 10 | **Supabase client duplicado** | Menor | `ai-process-message` | Baixo |
| 11 | **Hash colisões** — usar SHA-256 ou comparação directa | Menor | `ai-process-message` | Baixo |
| 12 | **Observabilidade incompleta** — rastrear chamadas auxiliares | Moderado | `ai-process-message` | Médio |

