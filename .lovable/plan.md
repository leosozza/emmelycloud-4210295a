## Atualizar /api-docs com OpenClaw e GitHub

Adicionar à página `/api-docs` documentação visível das duas integrações que estavam em falta.

### 1. Nova categoria "Integrações" (na barra de tabs)

Adicionar `integracoes` ao array de categories (ícone `Plug` ou `Zap`), com 4 entradas novas:

- **`openclaw-send`** (POST, Bearer JWT) — Reenviar uma mensagem recebida para o agente OpenClaw configurado e devolver a resposta. Inclui exemplo de request `{ integration_id, message, conversation_id, contact, test }` e response.
- **OpenClaw via MCP** — entrada informativa apontando para `/mcp-server` (link/anchor) explicando que o agente OpenClaw usa o MCP do Emmely com `X-API-Key: emk_live_...` para executar ferramentas no CRM.
- **`api-key-create` / `api-key-revoke`** já existem na categoria MCP — adicionar referência cruzada na nova categoria.
- **GitHub Sync (bidirecional)** — entrada informativa (sem endpoint, `auth: Public`) descrevendo como o projeto está ligado ao GitHub via Lovable (sync automático nos dois sentidos, branch principal, sem webhooks adicionais).

### 2. Cartão destacado "Integrar OpenClaw"

Acima do cartão MCP existente (ou logo abaixo), adicionar um Card com:
- Passo 1: gerar chave API em `/api-docs/keys`
- Passo 2: colar `https://emmelycloud.lovable.app/mcp-server` + header `X-API-Key` no OpenClaw
- Passo 3: registar endpoint do agente OpenClaw em `/integracoes` → aba OpenClaw para o Emmely poder pedir respostas
- Botão direto para `/integracoes`

### 3. Cartão destacado "GitHub"

Cartão informativo com:
- Estado: sincronização bidirecional ativa via Lovable + GitHub App
- Como conectar: Plus (+) → GitHub → Connect project
- Como exportar código: Code Editor → Download codebase, ou GitHub → Code → Download ZIP
- Nota de que a base de dados é exportada separadamente em Cloud → Database

### 4. Atualizar contador de stats

Adicionar uma stat "Integrações" no grid de estatísticas (passa de 5 para 6 cards) e atualizar o total no header.

### Ficheiros tocados

- `src/pages/ApiDocs.tsx` — adicionar entradas, categoria, 2 cards informativos, contador.

### Fora do âmbito

Nada a alterar em backend nem migrações — `openclaw-send` e tabela `openclaw_integrations` já existem da implementação anterior.