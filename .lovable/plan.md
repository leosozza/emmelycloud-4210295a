
# Aplicacao Bitrix24 Multi-Funcoes - Conector WhatsApp/Instagram

## Situacao Atual

**Backend esta a funcionar** - O conector esta registado e ativo no Bitrix24 (connector_registered: true, connector_active: true). Os eventos estao vinculados. O problema e apenas visual: o iframe nao finaliza a instalacao porque o Bitrix24 bloqueia o dominio do backend no iframe (X-Frame-Options).

## Problema da Instalacao

O Bitrix24 carrega o "Install URL" dentro de um iframe. Se esse URL aponta para o backend, o browser bloqueia porque o backend adiciona `X-Frame-Options: SAMEORIGIN` automaticamente. A solucao definitiva e servir TUDO pelo frontend (`emmelycloud.lovable.app/bitrix24`).

## Plano de Implementacao

### Passo 1 - Corrigir o fluxo de instalacao

Atualizar `src/pages/Bitrix24App.tsx` para:
- Detetar automaticamente se e a primeira vez (instalacao) via `BX24.getAuth()`
- Enviar os tokens ao backend via `fetch()` em background (sem iframe do backend)
- Chamar `BX24.installFinish()` diretamente do frontend apos o fetch ter sucesso
- Nunca carregar o dominio do backend dentro do iframe

**URLs no Bitrix24 (ambas apontam para o frontend):**
- Application URL: `https://emmelycloud.lovable.app/bitrix24`
- Install URL: `https://emmelycloud.lovable.app/bitrix24`

### Passo 2 - Interface com tabs multi-funcoes

Transformar o `Bitrix24App.tsx` numa aplicacao com tabs dentro do iframe:

| Tab | Funcao |
|-----|--------|
| Conector | Status do WhatsApp e Instagram, canais mapeados, botao de re-sincronizar |
| Conversas | Lista de conversas recentes do Emmely Cloud |
| Pagamentos | Resumo de pagamentos pendentes/pagos |
| Automacoes | Regras ativas e historico de execucao |

### Passo 3 - Tab "Conector" (prioridade)

Mostrar dentro do Bitrix24:
- Status da integracao (conectado/desconectado)
- Canais ativos (WhatsApp, Instagram) com nome da Open Line
- Botao "Re-sincronizar" que chama o backend para re-registar o conector
- Ultimas mensagens enviadas/recebidas (dos debug logs)

### Passo 4 - Atualizar config.toml

Adicionar `verify_jwt = false` para as funcoes bitrix24:
- `bitrix24-install`
- `bitrix24-events`
- `bitrix24-send`
- `bitrix24-connector-settings`

(O Bitrix24 envia form POST sem JWT, entao a verificacao deve estar desativada)

---

## Detalhes Tecnicos

### Bitrix24App.tsx - Estrutura

```text
Bitrix24App
  +-- BX24 SDK init
  +-- Auto-install flow (fetch ao backend)
  +-- Tabs (inline CSS para funcionar no iframe sem Tailwind)
      +-- ConnectorTab (status, canais, logs)
      +-- ConversasTab (placeholder para futuro)
      +-- PagamentosTab (placeholder para futuro)
      +-- AutomacoesTab (placeholder para futuro)
```

### Comunicacao Frontend-Backend

O frontend faz `fetch()` ao backend para todas as operacoes:
- `POST /functions/v1/bitrix24-install` - enviar tokens de instalacao
- `GET /functions/v1/bitrix24-connector-settings?member_id=xxx` - obter status (novo endpoint JSON)

O backend nunca e carregado diretamente no iframe.

### Edge Function bitrix24-connector-settings

Adicionar suporte a pedidos GET com resposta JSON (alem do HTML existente):
- Se `Accept: application/json` ou query param `format=json`, retorna JSON com status da integracao
- O frontend usa este endpoint para popular a tab "Conector"

### Ficheiros a Modificar

1. `src/pages/Bitrix24App.tsx` - Reescrever com tabs e fluxo de instalacao correto
2. `supabase/functions/bitrix24-connector-settings/index.ts` - Adicionar endpoint JSON
3. `supabase/config.toml` - Adicionar verify_jwt = false para funcoes bitrix24

### Ficheiros que NAO mudam

- `supabase/functions/bitrix24-install/index.ts` - Ja aceita JSON, so precisa do config.toml
- `supabase/functions/bitrix24-events/index.ts` - Sem alteracoes
- `supabase/functions/bitrix24-send/index.ts` - Sem alteracoes
