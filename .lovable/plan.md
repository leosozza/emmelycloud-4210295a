

# Plano: Integração Bitrix24 - Criar Aplicação

## Objetivo
Criar uma aplicação Bitrix24 completa que funcione como conector, permitindo:
- Instalação via OAuth no Bitrix24 (local ou Marketplace)
- Registro automático de conector de mensagens (WhatsApp/Instagram via Callbell)
- Fluxo bidirecional de mensagens entre Emmely Cloud e Bitrix24
- Token refresh automático
- Robots de automação BizProc (futuro)

## Fase 1 - Fundação (o que vamos implementar agora)

### 1.1 Tabela `bitrix24_integrations`
Armazenar credenciais OAuth, config do portal e estado do conector.

```text
bitrix24_integrations
+--------------------+-------------------+
| Campo              | Tipo              |
+--------------------+-------------------+
| id                 | UUID PK           |
| member_id          | TEXT UNIQUE       | -- ID unico do portal
| domain             | TEXT              |
| client_endpoint    | TEXT              |
| access_token       | TEXT              |
| refresh_token      | TEXT              |
| expires_at         | TIMESTAMPTZ       |
| application_token  | TEXT              | -- para validar webhooks
| connector_registered | BOOLEAN         |
| connector_active   | BOOLEAN           |
| config             | JSONB             | -- dados extras
| created_at         | TIMESTAMPTZ       |
| updated_at         | TIMESTAMPTZ       |
+--------------------+-------------------+
```

### 1.2 Tabela `bitrix24_channel_mappings`
Mapear canais (WhatsApp/IG) para Open Lines do Bitrix24.

```text
bitrix24_channel_mappings
+--------------------+-------------------+
| Campo              | Tipo              |
+--------------------+-------------------+
| id                 | UUID PK           |
| integration_id     | UUID FK           |
| channel            | TEXT              | -- whatsapp, instagram
| line_id            | INTEGER           |
| line_name          | TEXT              |
| is_active          | BOOLEAN           |
| created_at         | TIMESTAMPTZ       |
| updated_at         | TIMESTAMPTZ       |
+--------------------+-------------------+
```

### 1.3 Tabela `bitrix24_debug_logs`
Logs para diagnostico de problemas.

### 1.4 Secrets necessarios
- `BITRIX24_CLIENT_ID` - Client ID da aplicacao
- `BITRIX24_CLIENT_SECRET` - Client Secret da aplicacao

## Fase 2 - Edge Functions

### 2.1 `bitrix24-install` (handler de instalacao OAuth)
- Recebe POST do Bitrix24 quando usuario instala o app
- Parse de form data (formato PHP: `auth[access_token]`, `auth[domain]`, etc.)
- Salva credenciais na tabela `bitrix24_integrations` (upsert por `member_id`)
- Registra conector `emmely_connector` via `imconnector.register`
- Ativa conector em todas as Open Lines
- Vincula eventos (`OnImConnectorMessageAdd`, `OnImConnectorDialogStart`, etc.)
- Retorna HTML com `BX24.installFinish()` e headers CSP corretos para iframe

### 2.2 `bitrix24-connector-settings` (UI no Contact Center)
- Retorna HTML renderizado dentro do iframe do Bitrix24
- Mostra estado do conector (ativo/inativo)
- Permite selecionar canal (WhatsApp/Instagram) para mapear
- Headers CSP com frame-ancestors para todos os dominios bitrix24

### 2.3 `bitrix24-events` (webhook de eventos)
- Recebe eventos do Bitrix24 (OnImConnectorMessageAdd, etc.)
- Quando operador envia mensagem no Bitrix24:
  - Identifica a conversa no Emmely
  - Roteia para Callbell (WhatsApp) ou outro canal
- Detecta mensagens do bot para evitar loops
- Envia status de entrega de volta (`imconnector.send.status.delivery`)

### 2.4 `bitrix24-send` (Emmely para Bitrix24)
- Quando mensagem chega no Emmely (via Callbell webhook):
  - Busca mapeamento de canal
  - Envia para Bitrix24 via `imconnector.send.messages`
  - Fallbacks: timeline comment, activity, notificacao
  - Auto-reparo se linha inativa

### 2.5 `bitrix24-token-refresh` (helper)
- Logica reutilizavel de refresh de token OAuth
- Verifica expiracao com buffer de 5 minutos
- Atualiza tokens no banco automaticamente

## Fase 3 - Integracao Frontend

### 3.1 Pagina de configuracao Bitrix24
- Nova secao em Automacoes ou pagina dedicada
- Mostra estado da integracao (conectado/desconectado)
- Instrucoes para criar app local ou instalar do Marketplace
- Mostra mapeamentos de canais ativos
- Logs de diagnostico recentes

### 3.2 Atualizacao do webhook Callbell
- Modificar `callbell-webhook` para tambem chamar `bitrix24-send`
- Quando mensagem inbound chega via Callbell, replicar para Bitrix24

## Detalhes Tecnicos

### Config.toml - Novas funcoes
```text
[functions.bitrix24-install]
verify_jwt = false

[functions.bitrix24-connector-settings]
verify_jwt = false

[functions.bitrix24-events]
verify_jwt = false

[functions.bitrix24-send]
verify_jwt = false
```

Todas as funcoes Bitrix24 precisam `verify_jwt = false` porque o Bitrix24 nao envia JWT do Supabase.

### Headers CSP obrigatorios (para funcoes que retornam HTML)
```text
frame-ancestors 'self' 
  https://*.bitrix24.com 
  https://*.bitrix24.com.br 
  https://*.bitrix24.eu 
  https://*.bitrix24.es 
  https://*.bitrix24.de
```

### Extracao de dominio
Funcao robusta que tenta multiplas fontes em cascata:
1. `client_endpoint` 
2. `auth.domain`
3. `DOMAIN` / `domain`
4. Header `Referer`
5. Header `Origin`

### Prevencao de loops
- Detectar mensagens do bot por padroes de texto
- Lock de processamento por conversa (30s timeout)
- Deduplicacao por `external_id`

### Token refresh automatico
- Antes de cada chamada a API Bitrix24, verificar validade
- Refresh via `https://oauth.bitrix.info/oauth/token/`
- Buffer de 5 minutos antes da expiracao

## Ordem de Implementacao

1. Criar tabelas (`bitrix24_integrations`, `bitrix24_channel_mappings`, `bitrix24_debug_logs`)
2. Solicitar secrets (`BITRIX24_CLIENT_ID`, `BITRIX24_CLIENT_SECRET`)
3. Criar `bitrix24-install` (handler OAuth + registro conector)
4. Criar `bitrix24-connector-settings` (UI iframe)
5. Criar `bitrix24-events` (webhook Bitrix24 -> Emmely)
6. Criar `bitrix24-send` (Emmely -> Bitrix24 via imconnector)
7. Atualizar `callbell-webhook` para chamar `bitrix24-send`
8. Criar pagina de configuracao no frontend

## Notas Importantes (dos guias fornecidos)

- Usar `member_id` como identificador unico do portal (nunca muda)
- Tratar "Handler already binded" como sucesso
- Sempre usar `client_endpoint` do payload de instalacao (nao endpoint OAuth generico)
- Auto-reparo de Open Lines: verificar fila de operadores, TIMEMAN=N, CHECK_AVAILABLE=N
- Deteccao de modo CRM (Classico vs Simples) para criar Lead ou Deal
- Parse flexivel do body (JSON e form-urlencoded com notacao PHP)

