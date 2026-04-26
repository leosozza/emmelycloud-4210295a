## Diagnóstico real

Os logs confirmam que `qwen3.6:35b` e `qwen3.6:latest` falham com:

```
HTTP 500: model failed to load, this may be due to resource limitations
or an internal error, check ollama server logs for details
```

A falha é **imediata** (não timeout) — o Ollama recusa carregar porque já tem outros modelos grandes em memória dos testes anteriores do mesmo benchmark (`qwen2.5vl:32b` + `qwen2.5vl:32b-q4_K_M`, ~40GB combinados).

O OpenWebUI funciona porque **descarrega outros modelos antes de carregar um novo grande** e **faz retry** quando a primeira tentativa falha. O nosso warm-up atual só verifica `/api/ps` e dispara o load — não liberta memória.

## Solução

### 1. Função `ollama-warm-model` — libertar memória antes de carregar

Antes de chamar `/api/generate` para carregar o modelo alvo:

- Chamar `/api/ps` e listar todos os modelos atualmente em memória
- Para cada modelo carregado **diferente do alvo**, fazer `POST /api/generate` com `keep_alive: 0` e `prompt: ""` para forçar unload imediato
- Aguardar 2 segundos para o Ollama libertar a memória
- Só depois disparar o load do modelo alvo

### 2. Retry automático em falha de "resource limitations"

Quando o load falha com a mensagem `model failed to load` ou `resource limitations`:

- Aguardar 5 segundos
- Tentar **mais 2 vezes** (3 tentativas no total)
- Em cada retry, voltar a descarregar tudo o resto

### 3. Aplicar a mesma lógica no benchmark

A função `ollama-benchmark-models` tem uma versão inline do warm-up — atualizar para também descarregar os outros modelos antes de cada benchmark. Isto resolve o problema da imagem onde `qwen3.6:35b` falhou porque os 32b ainda estavam carregados.

### 4. Mensagens mais claras

Quando mesmo com retry e unload o modelo continua a falhar com "resource limitations", a mensagem deve ser explícita: o servidor Ollama não tem RAM/VRAM suficiente para este modelo isolado — não é problema da nossa app.

## Detalhes técnicos

**Ficheiros a editar:**
- `supabase/functions/ollama-warm-model/index.ts` — adicionar `unloadOtherModels()` + loop de retry
- `supabase/functions/ollama-benchmark-models/index.ts` — atualizar `warmUpModel()` inline com a mesma lógica (unload + retry)

**Endpoint Ollama usado para unload:**
```
POST /api/generate
{ "model": "<nome>", "keep_alive": 0, "prompt": "", "stream": false }
```

**Nenhuma alteração na UI** (`ChatIA.tsx`) é necessária — a correção é puramente backend.

**Nenhuma migração de BD** — só código de Edge Functions.

## Resultado esperado

Ao clicar **"Avaliar modelos"** em `/integracoes`:

- `qwen3.6:35b` e `qwen3.6:latest` passarão a ter scores reais (a menos que sozinhos não caibam na memória do servidor — aí sim, é hardware)
- O benchmark pode demorar mais 30-60s no total devido aos unloads, mas será fiável
- Recomendações (🥇 / ⚡ / ⚖️) serão calculadas com todos os modelos
