

# Integrar Ollama Remoto (Qwen) na Aplicação

## Contexto

Você hospedou o modelo Qwen 2.5:32b via Ollama e expôs através de um túnel Cloudflare. O ficheiro HTML mostra a comunicação direta com `https://languages-merchants-participated-varied.trycloudflare.com/api/chat`. Atualmente, o provedor `qwen-local` existe na base de dados mas aponta para `localhost:11434`.

## Problema

Existem **duas incompatibilidades** a resolver:

1. **URL**: O provedor `qwen-local` usa `localhost:11434` -- precisa apontar para a URL do túnel Cloudflare.
2. **Formato da API**: A edge function `ai-playground` usa o formato OpenAI (`/v1/chat/completions`), mas o Ollama nativo usa `/api/chat` com um formato de resposta ligeiramente diferente (NDJSON vs SSE). No entanto, o Ollama **tambem suporta** o endpoint compativel com OpenAI em `/v1/chat/completions`, o que simplifica a integração.

## Plano

### 1. Atualizar a URL do provedor na base de dados

Atualizar o registo `qwen-local` (ou criar um novo provedor `ollama-remote`) na tabela `ai_providers`:
- `base_url`: de `http://localhost:11434/v1/chat/completions` para `https://languages-merchants-participated-varied.trycloudflare.com/v1/chat/completions`
- Manter o endpoint compativel com OpenAI (`/v1/chat/completions`) para evitar alterações no código da edge function

### 2. Permitir configurar a URL do Ollama na interface

Adicionar na Central de Integrações (ou na configuração do provedor) um campo para guardar a URL do túnel Cloudflare como credencial na tabela `integration_credentials`, permitindo atualizá-la facilmente quando o túnel mudar sem precisar editar a base de dados diretamente.

### 3. Atualizar a edge function `ai-playground`

Modificar a lógica de resolução de URL para, quando o provedor for `qwen-local`, verificar primeiro se existe uma URL personalizada guardada em `integration_credentials` (chave como `OLLAMA_BASE_URL`). Isto permite que a URL do túnel seja dinâmica.

### 4. Adicionar modelo `qwen2.5:32b` à lista de modelos disponíveis

Garantir que o modelo `qwen2.5:32b` está listado nos modelos disponíveis do provedor para poder ser selecionado ao criar/editar agentes.

---

## Detalhe Tecnico

| Ficheiro | Alteracao |
|----------|-----------|
| **Migração SQL** | UPDATE `ai_providers` SET `base_url` para usar URL do tunel; adicionar `credential_key = 'base_url'` para permitir override dinamico |
| `supabase/functions/ai-playground/index.ts` | Quando o provider nao tem `auth_header` nem `auth_prefix` (como o Ollama), enviar request sem header de autorização; verificar override de `base_url` via `integration_credentials` |
| `src/pages/Integracoes.tsx` | Adicionar secção para configurar a URL do Ollama remoto (campo de texto para a URL do tunel) |

## Nota importante sobre o tunel Cloudflare

Os tuneis gratuitos do Cloudflare (`trycloudflare.com`) geram URLs temporarias que mudam cada vez que reinicia. Por isso, o campo de URL na interface e essencial para poder atualizar facilmente.

