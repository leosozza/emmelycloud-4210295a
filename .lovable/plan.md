

# Adicionar Provedores de IA e Voz ao Sistema Multi-Provedor

## Situacao Atual

A tabela `ai_providers` existe e o sistema ja suporta multi-provedor (a edge function `ai-playground` ja resolve credenciais dinamicamente). Porem, apenas o **Lovable AI** esta cadastrado. Precisamos popular os provedores e ajustar a UI.

## Provedores a Adicionar

### Provedores de Texto/Chat

| Provider | Slug | Base URL | Modelos |
|----------|------|----------|---------|
| OpenAI | openai | https://api.openai.com/v1/chat/completions | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini |
| DeepSeek | deepseek | https://api.deepseek.com/v1/chat/completions | deepseek-chat, deepseek-reasoner |
| Groq | groq | https://api.groq.com/openai/v1/chat/completions | llama-3.3-70b, mixtral-8x7b, gemma2-9b |
| Google Gemini | gemini | https://generativelanguage.googleapis.com/v1beta/openai/chat/completions | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |
| Qwen Local | qwen-local | http://localhost:11434/v1/chat/completions | qwen2.5:7b, qwen2.5:14b, qwen2.5:32b |

### Provedores de Voz

| Provider | Slug | Base URL | Tipo |
|----------|------|----------|------|
| ElevenLabs | elevenlabs | https://api.elevenlabs.io/v1 | TTS + STT + Conversational |
| OpenAI TTS | openai-tts | https://api.openai.com/v1/audio | TTS + STT |

## Alteracoes

### 1. Migracao SQL - Inserir Provedores

Inserir os 7 provedores na tabela `ai_providers` com os modelos disponiveis em `available_models` (formato JSON array com `name` e `display`), `base_url`, `credential_key` (nome da chave na tabela `integration_credentials`), e `is_native: false`.

Para os de voz, adicionar um campo `provider_type` na tabela `ai_providers`:
- `text` (default) - Provedores de chat/completions
- `voice` - Provedores de voz (TTS/STT)
- `multimodal` - Ambos

### 2. Tabela `ai_providers` - Nova Coluna

```text
provider_type text NOT NULL DEFAULT 'text'
```

Valores: `text`, `voice`, `multimodal`

### 3. Pagina Agentes (`src/pages/Agentes.tsx`)

- Separar provedores de texto e voz no selector
- Quando `agent_type` = "voice" ou "hybrid", mostrar selector adicional de **Provider de Voz** com os provedores tipo `voice`
- Adicionar campos:
  - `voice_provider`: slug do provedor de voz (nova coluna em `ai_agents`)
  - `voice_model`: modelo de voz (ex: `eleven_multilingual_v2`)
  - `voice_id`: ID da voz (ex: ID do ElevenLabs)
- Mostrar campos de credenciais quando provedor nao e nativo

### 4. Tabela `ai_agents` - Novas Colunas

```text
voice_provider text DEFAULT NULL
voice_model text DEFAULT NULL
voice_id text DEFAULT NULL
```

### 5. Pagina de Integracoes - Credenciais

O sistema ja tem `integration_credentials` e `manage-credentials`. Cada provedor usara:
- OpenAI: `provider=openai, credential_key=api_key`
- DeepSeek: `provider=deepseek, credential_key=api_key`
- Groq: `provider=groq, credential_key=api_key`
- Gemini: `provider=gemini, credential_key=api_key`
- ElevenLabs: `provider=elevenlabs, credential_key=api_key`
- Qwen Local: sem credencial (local)

As chaves sao configuradas na Central de Integracoes existente.

### 6. Edge Function `ai-playground` - Ajustes Menores

- Para Google Gemini direto: o header de auth e `x-goog-api-key` (sem Bearer), ja suportado pelo campo `auth_header` e `auth_prefix` na tabela
- Para Qwen Local: sem auth, ja funciona pois `apiKey` sera vazio e o endpoint local nao exige

### 7. Preview na UI

No card do agente, mostrar badges distintas para provider de texto e voz:
- Badge texto: "OpenAI / gpt-4o"
- Badge voz: "ElevenLabs / Sarah"

---

## Resumo Tecnico

### Migracoes SQL:
1. Adicionar `provider_type text DEFAULT 'text'` a `ai_providers`
2. Adicionar `voice_provider text`, `voice_model text`, `voice_id text` a `ai_agents`
3. Inserir 7 provedores com modelos e configuracoes

### Ficheiros a modificar:
- `src/pages/Agentes.tsx` - Selectores de voz, campos novos, badges
- Migracao SQL (via ferramenta)

### Ficheiros que NAO precisam de alteracao:
- `supabase/functions/ai-playground/index.ts` - Ja suporta multi-provedor dinamicamente
- `src/pages/Integracoes.tsx` - Ja permite configurar credenciais por provedor

