## Problema

O benchmark de LLMs marca `qwen3.6:35b` e `qwen3.6:latest` com score 0 porque retornam **resposta vazia** (~3s de latência). A causa: são modelos da família **Qwen3 com "thinking mode" ativo por padrão**. O Ollama gera o bloco de raciocínio interno (`<think>...</think>` ou campo `thinking`) mas, com `num_predict: 400`, o orçamento de tokens esgota antes do modelo emitir a resposta final visível em `message.content`.

O código atual em `supabase/functions/ollama-benchmark-models/index.ts`:
- Lê apenas `data.message.content` (vazio para modelos thinking)
- Não passa `think: false` ao Ollama
- Não aumenta `num_predict` para acomodar raciocínio

## Solução

Tornar o benchmark robusto a modelos Qwen3/DeepSeek-R1/qualquer modelo "thinking":

### 1. Detecção e tratamento de thinking models em `callOllamaChat`

- Detectar pelo nome do modelo (`qwen3`, `deepseek-r1`, `qwq`, `o1`, `r1`) e desativar thinking via `think: false` na chamada `/api/chat`.
- Caso o servidor Ollama não suporte `think: false` (versões antigas), aplicar fallback:
  - Aumentar `num_predict` para `1500` para modelos thinking (em vez de `400`).
  - Se `message.content` vier vazio mas existir `message.thinking`, usar `thinking` como fallback de resposta.
  - Limpar tags `<think>...</think>` do texto antes de devolver, caso apareçam embutidas.

### 2. Mensagem de erro mais clara

Quando a resposta continuar vazia após os fallbacks, em vez de gravar score 0 silenciosamente, gravar `error_message: "Modelo devolveu resposta vazia (provavelmente thinking model sem suporte)"` para o utilizador entender porque ficou 0/0 na tabela do frontend.

### 3. Ajuste do `num_predict` global

Aumentar o `num_predict` padrão de `400` para `600` (margem de segurança para todos os modelos sem afetar performance dos não-thinking).

## Como testar

1. Após o deploy, ir em **Integrações → Servidor Ollama → Avaliar modelos**.
2. Re-executar o benchmark apenas para `qwen3.6:35b` e `qwen3.6:latest`.
3. Confirmar que agora ou recebem score real (>0) ou mostram mensagem de erro clara.
4. Confirmar que `qwen2.5vl:32b-q4_K_M` continua a pontuar 100/100.

## Arquivos afetados

- `supabase/functions/ollama-benchmark-models/index.ts` — atualizar `callOllamaChat`, `benchmarkOneModel`, e a lógica de validação de resposta vazia.

Nenhuma alteração de schema ou frontend necessária.