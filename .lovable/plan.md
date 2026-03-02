

## Integrar WhatsApp QRCode (via WUZAPI)

O nome visivel ao utilizador sera sempre **"WhatsApp QRCode"** — nunca "WUZAPI" ou "Wuzapi". Internamente, o provider nos dados sera `wuzapi` mas toda a UI mostra "WhatsApp QRCode".

### Ficheiros a Criar

**1. `supabase/functions/wuzapi-webhook/index.ts`**
- Recebe webhooks do servidor WUZAPI (mensagens recebidas)
- Valida HMAC com SECRET_KEY
- Upsert conversation + insert message (direction=inbound)
- Dispara chatbot-reply se bot activo

**2. `supabase/functions/wuzapi-test-connection/index.ts`**
- Chama `GET /session/status` e `GET /session/qr` no servidor WUZAPI
- Retorna estado (connected/disconnected) e QR code se disponivel
- Credenciais lidas de `integration_credentials` (provider=wuzapi)

### Ficheiros a Editar

**3. `supabase/functions/message-send/index.ts`**
- Em `resolveCredentials`, detectar instancias com `config.provider === "wuzapi"`
- Quando wuzapi: enviar via `POST {base_url}/chat/send/text` com header `token`
- Formato telefone: numero puro (WUZAPI aceita sem @s.whatsapp.net no endpoint REST)
- Suporte a media: image, document, audio, video via endpoints respectivos

**4. `src/pages/Integracoes.tsx`**
- Adicionar card **"WhatsApp QRCode"** na OmniChannelTab (ao lado do WhatsApp Meta existente)
- Icone: `QrCode` do lucide-react, fundo verde
- Campos: URL do Servidor, Admin Token, User Token
- Botao "Testar Conexao" → chama `wuzapi-test-connection`
- Display de QR Code quando sessao desconectada (imagem base64)
- Botao "Configurar Webhook" → auto-configura callback URL
- Status: Conectado / Desconectado / A ler QR Code

**5. `supabase/config.toml`**
- Adicionar `[functions.wuzapi-webhook]` e `[functions.wuzapi-test-connection]` com `verify_jwt = false`

### Credenciais (integration_credentials)

| provider | credential_key | valor |
|---|---|---|
| wuzapi | WUZAPI_BASE_URL | `https://wazapi.ybrasil.com.br` |
| wuzapi | WUZAPI_ADMIN_TOKEN | `4059539e1c60f8c77daab20591e1cdbf` |
| wuzapi | WUZAPI_SECRET_KEY | `6c9c4fed1fc71aba1153a40d81de9b24` |
| wuzapi | WUZAPI_USER_TOKEN | (token do user, configuravel na UI) |

### channel_instances

Ao configurar, cria-se uma `channel_instance` com:
- `channel_type: "whatsapp"`, `name: "WhatsApp QRCode"`, `status: "active"`
- `config: { provider: "wuzapi", base_url, user_token }`

### Fluxo de Envio

```text
message-send → resolve instancia
  → config.provider === "wuzapi"?
    → POST {base_url}/chat/send/text { Phone: "5511...", Body: "msg" }
  → senao: Meta Cloud API (existente)
```

### Fluxo de Recepcao

```text
WUZAPI POST → wuzapi-webhook
  → Valida HMAC
  → Upsert conversation (channel=whatsapp)
  → Insert message (direction=inbound)
  → Trigger chatbot-reply
```

### UI — Card "WhatsApp QRCode"

- Titulo: "WhatsApp QRCode"
- Subtitulo: "Conexao via QR Code (sem API oficial)"
- Icone: QrCode (lucide) em fundo verde
- Seccoes: credenciais, status da sessao, QR code, webhook URL

