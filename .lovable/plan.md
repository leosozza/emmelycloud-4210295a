

## Objetivo

Adicionar à página **Integrações → IA**, abaixo da lista de modelos disponíveis do Ollama, uma funcionalidade de **benchmark** que testa cada modelo individualmente e produz uma **classificação** (ranking) por:

- **Inteligência** (qualidade da resposta a um conjunto de prompts de teste)
- **Velocidade** (latência média / tokens por segundo)
- **Recomendação de uso** (ex.: "Melhor para raciocínio complexo", "Melhor para respostas rápidas", "Melhor custo/benefício")

## Como vai funcionar

1. O utilizador clica em **"⚡ Avaliar modelos"** (novo botão por baixo dos badges).
2. O sistema executa, para cada modelo retornado pelo servidor Ollama, **3 prompts padronizados**:
   - **Raciocínio**: problema lógico/matemático curto.
   - **Conhecimento**: pergunta factual.
   - **Instrução**: pedido de formatação estruturada (ex.: "Responde só em JSON com chaves x,y").
3. Para cada modelo regista:
   - latência total (ms)
   - tokens gerados estimados (palavras × 1.3)
   - tokens/segundo
   - **score de qualidade 0–100** atribuído por um modelo juiz (Lovable AI — `google/gemini-3-flash-preview`) que recebe pergunta + resposta e devolve nota estruturada via tool calling.
4. Resultado renderizado como tabela ordenada com medalhas 🥇🥈🥉 e badge de recomendação:
   - **Mais inteligente** → maior score de qualidade médio.
   - **Mais rápido** → maior tokens/s.
   - **Equilibrado** → melhor produto `qualidade × velocidade`.
5. Resultados persistidos em nova tabela `ollama_model_benchmarks` para histórico (e poder mostrar último benchmark sem refazer).

## Plano de implementação

### 1. Nova tabela `ollama_model_benchmarks`

Colunas-chave: `model_name`, `provider_slug` (default `qwen-local`), `quality_score` (0–100), `avg_latency_ms`, `tokens_per_second`, `reasoning_score`, `knowledge_score`, `instruction_score`, `recommendation` (texto curto), `raw_results` (jsonb), `created_at`.

RLS: leitura/escrita apenas para `admin` (via `has_role`).

### 2. Nova Edge Function `ollama-benchmark-models`

Responsabilidades:

- Lê `OLLAMA_BASE_URL` de `integration_credentials` (mesma fonte que `ollama-test-connection`).
- Faz `GET /api/tags` → lista de modelos.
- Para cada modelo, executa os 3 prompts via `POST /api/chat` (não-stream), medindo latência.
- Para cada resposta, chama Lovable AI (gateway, `google/gemini-3-flash-preview`) com **tool calling** para devolver `{ score: 0-100, reason: string }` — evita parsing frágil de JSON.
- Calcula `quality_score` médio, `tokens_per_second`, atribui `recommendation`.
- Faz upsert em `ollama_model_benchmarks` (uma linha por modelo, sobrescreve a anterior) e também devolve o array completo na resposta.
- Suporta query param `?model=<nome>` para avaliar apenas um modelo (botão "Re-testar" individual).
- Timeout/proteção: máximo 6 modelos por chamada (configurável); se houver mais, devolve aviso.

### 3. Frontend — `Integracoes.tsx` (aba IA)

Por baixo do bloco "Modelos disponíveis":

- Botão **"⚡ Avaliar modelos"** com spinner enquanto corre.
- Carregamento inicial: lê `ollama_model_benchmarks` (último benchmark) e mostra tabela.
- Tabela com colunas: **#**, **Modelo**, **Qualidade** (barra 0–100), **Velocidade** (tok/s), **Latência média**, **Recomendação** (badge colorido).
- Ordenação por qualidade decrescente; medalhas nas 3 primeiras posições.
- Cards de destaque no topo: 🥇 Mais inteligente · ⚡ Mais rápido · ⚖ Mais equilibrado.
- Mensagem de progresso enquanto avalia ("A avaliar 3 de 6 modelos…").

### 4. Detalhes técnicos relevantes

- Prompts de teste fixos no edge function (pt-PT) — mesmos para todos os modelos, garantindo comparação justa.
- Modelo juiz: `google/gemini-3-flash-preview` via `LOVABLE_API_KEY` (já configurado).
- Estimativa tokens/s = `palavras × 1.3 / (latency_ms / 1000)` (heurística simples já usada em outras partes do projeto).
- Recomendação calculada server-side com regras simples:
  - top quality → "Melhor para raciocínio"
  - top speed → "Melhor para respostas rápidas"
  - top quality×speed → "Melhor custo/benefício"
  - restantes → "Uso geral"
- Tratamento de erros: se um modelo falhar (404/timeout) regista linha com `quality_score = null` e `recommendation = "Indisponível"` para não quebrar o lote.
- Rate-limit Lovable AI (402/429): apanhado e devolvido com mensagem amigável (toast).

## Verificação

1. Abrir Integrações → IA → clicar **"⚡ Avaliar modelos"**.
2. Ver progresso e, ao terminar, tabela ordenada com os 6 modelos atuais (`qwen3.6:35b`, `qwen3.6:latest`, `qwen2.5vl:32b`, `qwen2.5vl:32b-q4_K_M`, `llama3.2:3b`, `llama3.2:1b`).
3. Confirmar que `llama3.2:1b` aparece com velocidade alta mas qualidade baixa, e `qwen3.6:35b` com qualidade alta e velocidade baixa.
4. Recarregar a página → o último benchmark deve aparecer imediatamente (lido de `ollama_model_benchmarks`).
5. Clicar em "Re-testar" só num modelo → atualiza apenas essa linha.

