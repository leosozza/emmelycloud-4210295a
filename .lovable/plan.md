## Diagnóstico

O erro **não é um bug da aplicação** — é uma limitação de hardware no servidor Ollama remoto:

```
Ollama 500: model failed to load, this may be due to resource limitations
```

**Confirmado na base de dados** (`ollama_model_benchmarks`):

| Modelo | Estado | Tokens/s |
|---|---|---|
| `llama3.2:1b` | ✅ ⚡ Mais rápido | 116 tok/s |
| `llama3.2:3b` | ✅ ⚖️ Custo/benefício | 93 tok/s |
| `qwen2.5vl:32b-q4_K_M` | ✅ 🥇 Mais inteligente | 3.0 tok/s |
| `qwen2.5vl:32b` | ✅ Uso geral | 2.8 tok/s |
| **`qwen3.6:35b`** | ❌ **Indisponível** | erro 500 |
| **`qwen3.6:latest`** | ❌ **Indisponível** | erro 500 |

O `qwen3.6:35b` precisa de ~25-40 GB de RAM/VRAM. O servidor remoto não tem capacidade para o carregar — `ollama run qwen3.6:35b` falha logo no `model load`. Isto **só se resolve no servidor**, não no Emmely.

## O que vou melhorar no Emmely

Para que esta situação não volte a confundir, faço três melhorias de UX (sem tentar "consertar" o que está fora do nosso alcance):

### 1. Avisar logo no selector de agentes (`/chat`)

No `ChatIA.tsx`, ao carregar o agente seleccionado, fazer cross-reference com `ollama_model_benchmarks` e:

- Se o modelo do agente tem `recommendation = 'Indisponível'`, mostrar **banner vermelho** acima do input:
  > ⚠️ O modelo `qwen3.6:35b` está indisponível no servidor (sem recursos). Trocar para `qwen2.5vl:32b-q4_K_M` (recomendado) ou `llama3.2:3b` (rápido).
- Botão **"Trocar para modelo recomendado"** que faz `UPDATE ai_agents SET ai_model = 'qwen2.5vl:32b-q4_K_M'` directamente.
- Bloquear o envio de mensagens enquanto o modelo estiver indisponível (input desabilitado, em vez de o utilizador esperar 30s para receber erro).

### 2. Mensagem de erro mais clara no `/chat`

Em `ai-playground/index.ts`, quando o Ollama devolve `model failed to load`, intercepta e devolve mensagem amigável:

> O modelo **qwen3.6:35b** não cabe na memória do servidor Ollama. Escolhe um modelo mais leve (ex: `qwen2.5vl:32b-q4_K_M` ou `llama3.2:3b`) ou peça ao admin para libertar memória / reiniciar o serviço Ollama.

(em vez do JSON cru actual)

### 3. Tooltip explicativo na tabela de benchmarks (`/integracoes`)

Quando `recommendation = 'Indisponível'` na tabela de avaliação de modelos, adicionar tooltip:

> Modelo demasiado grande para o servidor Ollama actual. Soluções: (1) escolher modelo menor; (2) parar outros modelos com `ollama stop`; (3) aumentar RAM/VRAM do servidor.

## O que NÃO vou fazer

- Não vou re-tentar carregar o `qwen3.6:35b` automaticamente — o servidor já decidiu que não consegue.
- Não vou mexer no `ollama-benchmark-models` — está a funcionar bem (já detecta e regista o erro correctamente).
- Não vou mudar a configuração do servidor Ollama remoto — está fora do scope do Emmely.

## Acção do lado do utilizador (servidor Ollama)

Para realmente usar o Qwen 3.6 no futuro, precisas de fazer **no servidor que corre o Ollama** (não na Lovable):

```bash
# 1. Verificar memória disponível
free -h
nvidia-smi  # se houver GPU

# 2. Parar outros modelos carregados
ollama ps
ollama stop <modelo-em-uso>

# 3. Re-tentar
ollama run qwen3.6:35b "olá"
```

Se mesmo com tudo parado falhar → o servidor não tem RAM/VRAM suficiente para esse modelo. Tens de usar uma versão quantizada mais pequena (ex: `qwen3.6:35b-q4_0`) ou aumentar o hardware.

## Ficheiros alterados

- `src/pages/ChatIA.tsx` — banner de modelo indisponível + botão trocar
- `supabase/functions/ai-playground/index.ts` — interceptar erro "model failed to load"
- `src/pages/Integracoes.tsx` — tooltip explicativo na coluna recommendation