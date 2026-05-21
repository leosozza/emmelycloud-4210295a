## Integração Gupshup — WhatsApp Oficial (BSP)

Adicionar Gupshup como novo provider de WhatsApp Business API (alternativa ao Meta Cloud API direto), mantendo WUZAPI e Meta funcionando em paralelo.

### Arquitetura

```text
Cliente WhatsApp
      │
      ▼
Gupshup BSP ──(webhook)──► gupshup-webhook ──► conversations/messages
                                              │
                                              ├─► flow-engine
                                              └─► bitrix24-send

UI / flow-engine ──► message-send ──► gupshup-send ──► Gupshup API ──► Cliente
```

### Banco de dados

- `channel_instances`: novo `provider_type = 'gupshup'` (channel_type = 'whatsapp').
  - `config`: `{ app_name, app_id, source_number, api_key_secret_ref, webhook_secret_ref }`
- Nenhuma migration estrutural — usa schema existente.

### Edge Functions (novas)

1. **`gupshup-webhook`** (público, `verify_jwt = false`)
   - Valida HMAC-SHA256 do header `X-Gupshup-Signature` com `GUPSHUP_WEBHOOK_SECRET`.
   - Resolve `channel_instance` por `app` no payload.
   - Eventos suportados: `message` (text/image/audio/video/document/location/button_reply/list_reply), `message-event` (sent/delivered/read/failed).
   - Cria/atualiza `conversations` + `messages` com `external_id` = `gsId`.
   - Dispara `flow-engine` e `bitrix24-send` (fire-and-forget).
   - Anti-duplicação via `external_id`.

2. **`gupshup-send`** (service role)
   - Endpoint: `POST https://api.gupshup.io/wa/api/v1/msg`
   - Header `apikey: GUPSHUP_API_KEY`.
   - Suporta: text, image, video, document, audio, sticker, template (HSM com `template` + `params`).
   - Retorna `messageId` → grava em `messages.external_id`.
   - Trata erro 401/403/429 com toast amigável.

### Edge Functions (alteradas)

3. **`message-send`**: roteia para `gupshup-send` quando `channel_instances.provider_type = 'gupshup'` (além do Meta/WUZAPI já existentes).
4. **`flow-engine`**: sem mudanças — usa `message-send` como abstração.

### Frontend

5. **`src/pages/Integracoes.tsx`** (ou aba WhatsApp existente): novo card "Gupshup (WhatsApp Oficial)" com formulário:
   - Nome da instância
   - App Name (Gupshup)
   - App ID
   - Source Number (E.164)
   - Botão para registar `GUPSHUP_API_KEY` e `GUPSHUP_WEBHOOK_SECRET` (via secrets).
   - Mostra URL do webhook a colar no painel Gupshup: `https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/gupshup-webhook`.

6. **`ChannelIcon` / badges**: rotular `provider_type='gupshup'` como "Gupshup Oficial".

### Segredos necessários

- `GUPSHUP_API_KEY` — apikey da conta Gupshup (Settings → API Key).
- `GUPSHUP_WEBHOOK_SECRET` — usado para HMAC do callback (configurado no painel Gupshup).

### API Docs / MCP

7. Atualizar `src/pages/ApiDocs.tsx` e `supabase/functions/mcp-server/index.ts` adicionando provider `gupshup` à descrição de `message-send` e listando `gupshup-webhook` / `gupshup-send`.

### Ordem de execução

1. Pedir secrets (`GUPSHUP_API_KEY`, `GUPSHUP_WEBHOOK_SECRET`).
2. Criar `gupshup-webhook` + `gupshup-send` + config.toml entry (`verify_jwt=false` no webhook).
3. Alterar `message-send` para incluir routing Gupshup.
4. UI de configuração da instância em Integrações.
5. Atualizar ApiDocs + MCP.

Confirma para eu começar pedindo os secrets do Gupshup?
