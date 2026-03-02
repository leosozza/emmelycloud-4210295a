

## Conferencia WUZAPI vs Documentacao + Simplificacao de Credenciais

### Analise da API WUZAPI (docs em wazapi.ybrasil.com.br/api)

A API usa **dois tipos de autenticacao**:
- **Admin endpoints** (`/admin/users`, etc): header `Authorization` com `WUZAPI_ADMIN_TOKEN`
- **Standard endpoints** (session, chat, webhook): header `token` com **user token** (criado via admin)

O fluxo correcto e: usar o admin token para **criar automaticamente um user** via `POST /admin/users`, guardar o user token retornado, e usar esse token para session/chat/webhook.

### Problemas Actuais

1. O card pede 4 campos incluindo `WUZAPI_USER_TOKEN` manualmente — o utilizador quer apenas 3 (URL, Admin Token, Secret Key)
2. O `wuzapi-test-connection` usa `user_token` nos headers — mas sem user criado, nao funciona
3. O `message-send` tambem tenta resolver `WUZAPI_USER_TOKEN` que nao existira
4. O `config.toml` nao tem entradas para `wuzapi-webhook` e `wuzapi-test-connection`

### Plano de Correcao

**1. Editar `src/pages/Integracoes.tsx`**
- Remover campo `WUZAPI_USER_TOKEN` do card (linha 486)
- Manter apenas: `WUZAPI_BASE_URL`, `WUZAPI_ADMIN_TOKEN`, `WUZAPI_SECRET_KEY`

**2. Editar `supabase/functions/wuzapi-test-connection/index.ts`**
- Ao resolver credenciais, usar `WUZAPI_ADMIN_TOKEN` em vez de `WUZAPI_USER_TOKEN`
- Adicionar logica de auto-criacao de user: ao primeiro uso, chamar `POST /admin/users` com o admin token para criar um user "emmely", guardar o user token retornado em `integration_credentials` como `WUZAPI_USER_TOKEN`
- Usar o user token criado para session/qr/webhook endpoints
- Header admin: `Authorization: <admin_token>` | Header user: `token: <user_token>`

**3. Editar `supabase/functions/message-send/index.ts`**
- Na resolucao de credenciais WUZAPI (linhas 222-233), resolver `WUZAPI_USER_TOKEN` do `integration_credentials` (que foi auto-criado pelo test-connection)
- Tambem verificar `cfg.user_token` no config da channel_instance

**4. Editar `supabase/config.toml`**
- Adicionar:
```toml
[functions.wuzapi-webhook]
verify_jwt = false

[functions.wuzapi-test-connection]
verify_jwt = false
```

### Fluxo do Utilizador Simplificado

```text
1. Preencher: URL do Servidor, Admin Token, Secret Key
2. Clicar "Ativar Instância"
3. Backend auto-cria user via /admin/users (usando admin token)
4. Backend guarda user_token internamente
5. Testar Conexão → mostra QR code (usando user token)
6. Configurar Webhook → regista URL (usando user token)
```

| Ficheiro | Accao |
|---|---|
| `src/pages/Integracoes.tsx` | Remover campo WUZAPI_USER_TOKEN |
| `supabase/functions/wuzapi-test-connection/index.ts` | Auto-criar user com admin token, guardar user token |
| `supabase/functions/message-send/index.ts` | Resolver user_token auto-criado |
| `supabase/config.toml` | Adicionar wuzapi-webhook e wuzapi-test-connection |

