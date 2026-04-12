

# Registar Todos os Agentes Ativos como Chatbots no Bitrix24

## Problema Actual
Existe apenas 1 bot registado no Bitrix24 ("Emmely AI") e um toggle para escolher qual agente IA "pilota" esse bot. O utilizador quer que **cada agente ativo** apareça como um chatbot separado no Bitrix24, permitindo ao utilizador do CRM escolher com qual agente quer falar.

## Arquitectura Proposta

Cada agente ativo na plataforma = 1 bot registado via `imbot.register` no Bitrix24, com CODE único (`emmely_agent_{uuid_curto}`) e NAME = nome do agente. O worker identifica qual agente responder pelo `BOT_ID` recebido no payload do evento.

```text
┌─────────────┐     imbot.register × N     ┌──────────────┐
│  AI Agents   │ ──────────────────────────► │  Bitrix24    │
│  (ativos)    │   CODE: emmely_agent_xxx   │  Bot List    │
└─────────────┘                             └──────────────┘
       │                                          │
       │  bitrix_bot_id (campo novo)              │ BOT_ID no evento
       ▼                                          ▼
┌─────────────┐     lookup by BOT_ID        ┌──────────────┐
│  ai_agents   │ ◄───────────────────────── │  Worker      │
│  table       │   → agent_id encontrado    │  (events)    │
└─────────────┘                             └──────────────┘
```

## Alterações

### 1. Migração — Campo `bitrix_bot_id` na tabela `ai_agents`
Adicionar coluna `bitrix_bot_id TEXT` à tabela `ai_agents` para guardar o ID do bot Bitrix24 registado para cada agente. Remover `bitrix_agent_id` da tabela `bitrix24_integrations` (já não necessário — a relação é 1:1 agente↔bot).

### 2. `supabase/functions/bitrix24-reregister-bot/index.ts` — Multi-bot
Refactoring completo:
- **Step 1**: Listar bots existentes e desregistar todos os `emmely_*`
- **Step 2**: Buscar todos os agentes com `is_active = true`
- **Step 3**: Para cada agente, chamar `imbot.register` com:
  - `CODE`: `emmely_agent_{agent.id.substring(0,8)}`
  - `PROPERTIES.NAME`: nome do agente (ex: "Consultor Jurídico", "Suporte Técnico")
  - `PROPERTIES.WORK_POSITION`: descrição do agente ou "Assistente Virtual IA"
  - Mesmos eventos (`EVENT_MESSAGE_ADD`, `EVENT_WELCOME_MESSAGE`, etc.)
- **Step 4**: Guardar o `bot_id` retornado na coluna `ai_agents.bitrix_bot_id`
- Remover lógica de salvar `bot_id` no `config` da integração

### 3. `supabase/functions/bitrix24-worker/index.ts` — Routing por BOT_ID

**`handleBotMessage`**: Em vez de procurar agente por `bitrix_agent_id` ou `is_default`:
1. Extrair `BOT_ID` do payload (já existe)
2. `SELECT id, welcome_message FROM ai_agents WHERE bitrix_bot_id = BOT_ID AND is_active = true`
3. Se não encontrar, fallback para `is_default` → qualquer ativo

**`handleWelcome`**: Mesma lógica — buscar agente pelo `BOT_ID` do evento para usar a `welcome_message` correcta.

### 4. UI — `AgentCard.tsx` e `Agentes.tsx`
- **Remover** o toggle "Ativar no Bitrix24" individual (já não necessário)
- **Adicionar** badge informativo no card: se `agent.bitrix_bot_id` existe → mostrar `"🤖 Bot Bitrix24 #ID"`
- **Adicionar** botão global "Sincronizar Bots Bitrix24" no header da página Agentes, que chama a edge function `bitrix24-reregister-bot` para re-registar todos os agentes ativos
- Quando um agente é activado/desactivado, sugerir ao utilizador sincronizar

### 5. Limpeza — `bitrix24_integrations.config.bot_id`
O worker deixa de usar `config.bot_id` como fallback único — o `BOT_ID` vem sempre do payload do evento e é mapeado directamente ao agente.

## Ficheiros a alterar

| Ficheiro | Acção |
|---|---|
| **Migração SQL** | Adicionar `bitrix_bot_id TEXT` a `ai_agents`; remover `bitrix_agent_id` de `bitrix24_integrations` |
| `supabase/functions/bitrix24-reregister-bot/index.ts` | Loop sobre agentes ativos, registar 1 bot por agente, guardar `bitrix_bot_id` |
| `supabase/functions/bitrix24-worker/index.ts` | `handleBotMessage` e `handleWelcome`: lookup agente por `bitrix_bot_id` |
| `src/components/agentes/AgentCard.tsx` | Remover toggle Bitrix24; adicionar badge informativo |
| `src/pages/Agentes.tsx` | Remover `toggleBitrixAgent`; adicionar botão "Sincronizar Bots Bitrix24" |

