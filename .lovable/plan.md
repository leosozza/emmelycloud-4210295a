

## Diagnóstico

Quando o túnel Cloudflare do Ollama é renovado e o servidor passa a servir um modelo novo (ex.: substituiu `qwen2.5:32b` por outro), três coisas falham:

1. **Dropdown "Modelo" vazio / só mostra o antigo** no formulário do agente — porque `ai_providers.available_models` está fixo em `[{"name":"qwen2.5:32b"}]` e ninguém atualiza.
2. **Agente continua a chamar o modelo antigo** — porque o agente foi gravado com `ai_model = "qwen2.5:32b"`, modelo que já não existe no servidor → erro 404 / "model not found".
3. **Alguns agentes ignoram a nova URL** — porque têm `ai_base_url` fixado a uma URL Cloudflare antiga (`languages-merchants-participated-varied...`). O override de `integration_credentials` só atua quando `ai_base_url` está vazio.

Estado atual da BD:

| onde | valor |
|---|---|
| `integration_credentials` (URL ativa) | `https://fcc-reverse-dive-demographic.trycloudflare.com` |
| `ai_providers.base_url` (qwen-local) | `https://languages-merchants-participated-varied.trycloudflare.com/v1/chat/completions` (antigo) |
| `ai_providers.available_models` | `[{name: "qwen2.5:32b"}]` (antigo) |
| 6 de 7 agentes | `ai_base_url` fixado a túnel antigo |

## Objectivo

Que sempre que o túnel/servidor Ollama mude:
- A lista de modelos no formulário do agente reflicta os modelos realmente disponíveis no servidor.
- A URL gravada nos agentes nunca esteja "presa" a um túnel antigo.
- O agente actual volte a funcionar imediatamente.

## Plano de implementação

### 1. Auto-sincronização de modelos do Ollama (núcleo da correcção)

Modificar `supabase/functions/ollama-url-webhook/index.ts` para que, depois de gravar a nova URL:

- Faça `GET {nova_url}/api/tags` para obter a lista real de modelos.
- Actualize `ai_providers.base_url` para a nova URL (formato `https://.../v1/chat/completions`).
- Actualize `ai_providers.available_models` com os modelos retornados, no formato `[{ name, display }]`.
- Limpe `ai_base_url` de todos os agentes `qwen-local` (`UPDATE ai_agents SET ai_base_url = NULL WHERE ai_provider = 'qwen-local'`) — assim passam a usar sempre o override de credenciais (verdade única).
- Se algum agente tiver `ai_model` que já não existe na nova lista, marcar e atribuir o primeiro modelo disponível (com log de auditoria em `ollama_url_audit`).

### 2. Botão "Sincronizar modelos agora" no formulário

Em `AgentFormDialog.tsx`, no Step 2 (Inteligência), quando o provider seleccionado for não-nativo e tipo Ollama (slug `qwen-local`), adicionar um pequeno botão "↻ Sincronizar modelos" ao lado do dropdown. Ele:

- Chama `ollama-test-connection` (que já lê `/api/tags`).
- Persiste os modelos retornados em `ai_providers.available_models` (via nova action interna ou reaproveitando a edge `ollama-test-connection` para também gravar).
- Recarrega os providers no diálogo.

Isto dá ao utilizador uma forma manual quando não houver webhook.

### 3. Correcção imediata dos dados actuais

Migration única (one-shot) para deixar o sistema operacional já:

- Limpar `ai_base_url` de todos os agentes com `ai_provider = 'qwen-local'`.
- Pingar a URL actual e refrescar `ai_providers.base_url` + `available_models` para `qwen-local`.
- Se o modelo `qwen2.5:32b` já não existir no servidor, actualizar `ai_model` dos agentes para o primeiro modelo disponível.

### 4. Mensagens de erro claras

Em `ai-process-message/index.ts` e `ai-playground/index.ts`, ao receber 404 do Ollama com `error.message` contendo "model" / "not found", devolver mensagem amigável: *"O modelo X já não está disponível no servidor Ollama. Vá a Agentes → Editar → Sincronizar modelos."*

## Detalhes técnicos

- Endpoint Ollama de listagem: `GET {base}/api/tags` → `{ models: [{ name, size, ... }] }`.
- Mapeamento para `available_models`: `models.map(m => ({ name: m.name, display: m.name }))`.
- A regex já existente `replace(/\/v1\/chat\/completions$/, "")` é reaproveitada para normalizar URL antes de chamar `/api/tags`.
- O webhook continua autenticado pelo `OLLAMA_WEBHOOK_SECRET`; nenhum endpoint novo público.
- A sincronização é best-effort: se `/api/tags` falhar, o webhook ainda assim grava a URL e regista o erro em `ollama_url_audit` (não bloqueia).

## Verificação

1. Disparar manualmente o webhook com a URL actual `https://fcc-reverse-dive-demographic.trycloudflare.com` → confirmar que `ai_providers.available_models` passa a listar os modelos reais.
2. Abrir o formulário de um agente Qwen → o dropdown "Modelo" mostra os novos modelos.
3. Gravar e testar o agente no Playground → resposta normal, sem 404.
4. Mudar o túnel + chamar webhook de novo → tudo se sincroniza sem intervenção manual.

