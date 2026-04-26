## Objetivo

Fazer com que **todos os modelos** instalados no servidor Ollama (incluindo `qwen3.6:35b`, `qwen3.6:latest`) funcionem no Emmely, exatamente como já funcionam no OpenWebUI.

A "limitação" não é de hardware — é da nossa implementação atual:
- Usamos `/v1/chat/completions` (camada compatível OpenAI) sem controlo de `keep_alive`
- Timeout fixo de 3 min é insuficiente para o 1º carregamento de modelos 35B
- Não pré-descarregamos modelos antigos antes de carregar o novo → Ollama tenta meter 2 em memória → erro 500
- Cada chamada é "fria" — sem aquecimento prévio

## Solução: 5 alterações coordenadas

### 1. Nova edge function `ollama-warm-model`

**Ficheiro novo:** `supabase/functions/ollama-warm-model/index.ts`

Função utilitária que:
- Recebe `{ model: string }`
- Lê a `OLLAMA_BASE_URL` da `integration_credentials`
- Chama `GET /api/ps` para ver o que está carregado
- Se o modelo pedido **já está quente** → devolve `{ ready: true, was_loaded: true }` em <1s
- Se não está → faz `POST /api/generate` com `{ model, prompt: "", keep_alive: "10m" }` (esta chamada faz o Ollama carregar o modelo e descarregar os outros automaticamente)
- Faz polling em `/api/ps` (até 6 min) até confirmar que está em memória
- Devolve `{ ready: true, load_time_ms: 145000 }` ou `{ ready: false, error: "..." }`

Esta função é a peça-chave: replica o que o OpenWebUI faz internamente.

### 2. Reescrever `ai-playground` para usar pré-aquecimento

**Ficheiro:** `supabase/functions/ai-playground/index.ts`

Fluxo novo (apenas para `ai_provider !== 'lovable'`):

```
1. Antes de fazer fetch ao Ollama, invocar ollama-warm-model com o modelo do agente
2. Esperar até receber { ready: true } (ou erro claro)
3. Se warm-up demorou >0ms (modelo estava frio), usar timeout de 30s para a inferência
   Se warm-up foi instantâneo (já quente), manter timeout 3 min para respostas longas
4. Fazer a chamada normal /v1/chat/completions
5. Se warm-up falhar → devolver mensagem clara ao utilizador antes de tentar inferência
```

Vantagem: nunca mais o erro "model failed to load" durante inferência — ou pré-carrega com sucesso, ou aborta cedo com mensagem útil.

### 3. Aplicar mesma estratégia ao `ai-process-message`

**Ficheiro:** `supabase/functions/ai-process-message/index.ts` (motor principal de chat)

Mesma lógica do ponto 2 — pré-aquecer antes de inferir. Cobertura completa: chat playground + WhatsApp + Instagram + Bitrix24 chatbots.

### 4. Atualizar `ollama-benchmark-models` para usar warm-up

**Ficheiro:** `supabase/functions/ollama-benchmark-models/index.ts`

Atualmente o benchmark falha em modelos grandes porque tenta inferir diretamente. Com warm-up:
- Cada modelo é pré-carregado primeiro (com timeout de 6 min)
- Só depois é medida a velocidade de inferência (1 frase curta)
- Modelos antes marcados "Indisponível" passarão a ter benchmark real

### 5. Remover bloqueios proativos no frontend (`ChatIA.tsx`)

**Ficheiro:** `src/pages/ChatIA.tsx`

O banner vermelho "Modelo indisponível" + bloqueio de input criados na iteração anterior deixam de fazer sentido — agora **todos os modelos vão funcionar**.

Substituir por:
- **Indicador subtil** de estado do modelo: "🔥 Modelo quente" / "⏳ A aquecer modelo (pode demorar 1-3 min na 1ª utilização)" / "✅ Pronto"
- **Sem bloqueio de input** — utilizador pode escrever; mensagem só é enviada após warm-up
- **Sem botão "trocar modelo"** automático

## Detalhes técnicos

### Endpoints Ollama nativos usados

| Endpoint | Uso |
|---|---|
| `GET /api/tags` | Listar modelos instalados (já usamos) |
| `GET /api/ps` | Ver modelos atualmente em memória (novo) |
| `POST /api/generate` com `prompt:""` e `keep_alive` | Pré-carregar modelo (novo) |
| `POST /v1/chat/completions` | Inferência real (mantém-se) |

### Timeouts revistos

| Operação | Timeout atual | Timeout novo |
|---|---|---|
| Warm-up modelo pequeno (<5GB) | — | 60s |
| Warm-up modelo médio (5-15GB) | — | 180s |
| Warm-up modelo grande (>15GB, ex: 35B) | — | 360s (6 min) |
| Inferência após warm-up | 180s | 180s |

### Fluxo visual (chat)

```text
Utilizador escreve → Submit
    ↓
Frontend mostra "⏳ A preparar modelo..."
    ↓
Edge function: warm-up (instantâneo se quente, até 6 min se frio)
    ↓
Frontend mostra "💬 A pensar..."
    ↓
Edge function: inferência real
    ↓
Resposta (streaming)
```

### Casos de erro residuais

Mesmo com warm-up, podem ocorrer:
- Modelo realmente não cabe em RAM → `/api/generate` devolve 500 → mensagem clara: *"O servidor Ollama não tem memória suficiente para carregar este modelo nem mesmo descarregando os outros. Aumente RAM/VRAM."*
- Túnel Cloudflare caiu → erro de rede claro
- Servidor Ollama desligado → erro de conexão claro

## Ficheiros alterados

- ✨ **Novo:** `supabase/functions/ollama-warm-model/index.ts`
- ✏️ `supabase/functions/ai-playground/index.ts` (adicionar warm-up)
- ✏️ `supabase/functions/ai-process-message/index.ts` (adicionar warm-up)
- ✏️ `supabase/functions/ollama-benchmark-models/index.ts` (warm-up antes de medir)
- ✏️ `src/pages/ChatIA.tsx` (remover bloqueio, adicionar indicador de aquecimento)

## Verificação após implementação

1. Selecionar agente com `qwen3.6:35b` → enviar "olá" → deve aquecer (1-3 min na 1ª vez) e responder
2. Re-enviar imediatamente → deve responder em segundos (modelo quente)
3. Trocar para `llama3.2:3b` → deve descarregar o 35B e carregar o 3B automaticamente
4. Re-correr benchmark em `/integracoes` → todos os modelos devem aparecer com tempo real (sem "Indisponível")

## O que NÃO muda

- Lovable AI (`ai_provider = 'lovable'`) continua sem warm-up — não é necessário
- Configuração do servidor Ollama remoto — zero mudanças do lado dele
- Estrutura de agentes, base_prompt, RAG, knowledge base — tudo intacto