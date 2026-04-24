

## Problema

O `/chat` parece travado quando usas modelos LLM locais (Ollama via Cloudflare tunnel). Causas:

1. **Sem streaming** — a edge function `ai-playground` espera o Ollama gerar a resposta inteira antes de devolver. Com `qwen3.6:35b` isso demora 30-90s e o utilizador vê só um spinner.
2. **Sem timeout nem feedback** — não há indicação de tempo decorrido nem aviso "modelo a carregar" (Ollama demora extra ~10-30s na primeira chamada para carregar o modelo na VRAM).
3. **Tunnel Cloudflare** adiciona latência variável (50-500ms por chunk) que se acumula sem streaming.
4. **Sem aviso de modelo lento** — a UI não mostra que o agente seleccionado é um modelo de 35B (lento por natureza).

## Plano de correção

### 1. Streaming token-a-token na `ai-playground`

- Aceitar `stream: true` no payload e passar para o Ollama (compatível com OpenAI API).
- Devolver SSE (`text/event-stream`) directamente do Ollama para o cliente, sem buffer.
- Manter modo não-streaming como fallback (compatibilidade com outros chamadores).

### 2. Frontend `/chat` consome stream

Em `src/pages/ChatIA.tsx`, refazer o `handleSend`:
- Usar `fetch` directo para `${VITE_SUPABASE_URL}/functions/v1/ai-playground` com header `Authorization: Bearer <publishable_key>`.
- Parser SSE linha-a-linha (padrão do skill `connecting-to-ai-models`).
- Atualizar a última mensagem do assistant a cada token recebido — feedback imediato em vez de spinner de 60s.
- Suporte a cancelar com `AbortController` (botão "Parar" enquanto streama).

### 3. Indicadores visuais de progresso

Na bolha do assistant durante o streaming:
- Enquanto não chega o primeiro token: badge **"A carregar modelo…"** (≤10s) → **"A pensar…"** (>10s).
- Cronómetro discreto (`0:23`) ao lado do spinner para o utilizador saber que não está parado.
- Mostrar o nome do modelo activo abaixo do header (ex.: `qwen3.6:35b · Qwen Local`).

### 4. Aviso de modelo pesado

No selector de agentes (sidebar), se o modelo for `>=14B` ou `vl`, badge ⚠️ **"lento"** com tooltip: "Este modelo demora 30-90s. Para respostas rápidas escolhe um agente com `llama3.2:3b` ou similar."

### 5. Timeout configurável e mensagem útil

- Timeout de 180s na chamada ao Ollama (em vez do default que pode pendurar indefinidamente).
- Em caso de timeout: toast "O modelo `<nome>` não respondeu em 3 min. Verifica se o servidor Ollama está activo ou escolhe um modelo mais leve."

### 6. (Opcional, não bloqueante) Pre-warm do modelo

Botão **"Aquecer modelo"** no sidebar que faz uma chamada `POST /api/generate` com `keep_alive: "30m"` ao Ollama para o modelo ficar carregado em VRAM. Reduz a 1ª resposta em 10-30s.

## Detalhes técnicos

- `ai-playground` passa a usar `stream: true` no body do Ollama; o response body é re-emitido com `Content-Type: text/event-stream`.
- O parser do frontend segue o padrão do skill (line-by-line, ignora `:` keepalive, re-buffer JSON parcial, flush final).
- `AbortController` no `handleSend` permite cancelar e o servidor Ollama fecha o stream quando o cliente desconecta.
- Os campos persistidos na sessão continuam a ser a mensagem completa (ao acabar o stream).

## Como testar

1. Abrir `/chat`, escolher agente com `qwen3.6:35b`, enviar "Olá". Primeiros tokens devem aparecer em ≤15s, não 60s.
2. Trocar para agente com `llama3.2:3b`. Resposta deve começar em ≤2s.
3. Enviar mensagem longa e clicar **Parar** a meio — stream interrompe imediatamente.
4. Desligar o tunnel Cloudflare, enviar mensagem → toast de timeout claro após 3 min.
5. Confirmar badge ⚠️ "lento" no selector para agentes com modelos `>=14B`.

