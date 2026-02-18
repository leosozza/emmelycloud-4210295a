# Guia Definitivo: Conector Bitrix24 + WhatsApp

> **Versão**: 3.0 - Consolidado com todas as lições aprendidas  
> **Última Atualização**: Janeiro 2025  
> **Propósito**: Evitar todos os erros já superados ao criar novos conectores

Este documento consolida TODOS os aprendizados, armadilhas, soluções e padrões descobertos durante o desenvolvimento de integrações Bitrix24. Use como referência para criar novas aplicações sem repetir os mesmos erros.

---

## 📋 Índice

1. [Arquitetura Essencial](#1-arquitetura-essencial)
2. [Configuração Obrigatória](#2-configuração-obrigatória)
3. [Headers CSP para Iframes](#3-headers-csp-para-iframes)
4. [Extração de Domínio](#4-extração-de-domínio)
5. [Registro e Ativação do Conector](#5-registro-e-ativação-do-conector)
6. [Mapeamento de Canais](#6-mapeamento-de-canais)
7. [Fluxo de Mensagens Bidirecional](#7-fluxo-de-mensagens-bidirecional)
8. [Prevenção de Loops e Duplicações](#8-prevenção-de-loops-e-duplicações)
9. [Sistema de Auto-Reparo](#9-sistema-de-auto-reparo)
10. [Open Lines - Configuração Crítica](#10-open-lines---configuração-crítica)
11. [Detecção de Modo CRM](#11-detecção-de-modo-crm)
12. [Token Refresh Automático](#12-token-refresh-automático)
13. [Multi-Binding para CRM](#13-multi-binding-para-crm)
14. [Vinculação Workspace-Integração](#14-vinculação-workspace-integração)
15. [Erros Comuns e Soluções](#15-erros-comuns-e-soluções)
16. [Checklist de Deploy](#16-checklist-de-deploy)
17. [Templates de Código](#17-templates-de-código)

---

## 1. Arquitetura Essencial

### 1.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BITRIX24 PORTAL                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │   CRM        │  │ Contact      │  │  Automação               │   │
│  │ (Lead/Deal)  │  │ Center       │  │  (Robots/Workflows)      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘   │
└─────────┼─────────────────┼──────────────────────┼──────────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE EDGE FUNCTIONS                          │
│                                                                     │
│  INSTALAÇÃO/REGISTRO:                                               │
│  ├── bitrix24-install        → Recebe OAuth, cria integração        │
│  ├── bitrix24-register       → Registra conector + robôs + SMS      │
│  └── bitrix24-connector-settings → UI no Contact Center             │
│                                                                     │
│  EVENTOS/WEBHOOKS:                                                  │
│  ├── bitrix24-events         → Recebe eventos do Bitrix24           │
│  ├── bitrix24-webhook        → Webhook principal, roteia eventos    │
│  └── bitrix24-worker         → Processa mensagens de operadores     │
│                                                                     │
│  ENVIO:                                                             │
│  ├── bitrix24-send           → Envia mensagem WhatsApp→Bitrix24     │
│  └── bitrix24-robot-handler  → Processa robôs de automação          │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SUPABASE DATABASE                               │
│  ┌──────────────────┐  ┌────────────────────────┐                   │
│  │ integrations     │  │ bitrix_channel_mappings │                  │
│  │ (config JSONB)   │  │ (instance ↔ line_id)   │                   │
│  └──────────────────┘  └────────────────────────┘                   │
│  ┌──────────────────┐  ┌────────────────────────┐                   │
│  │ instances        │  │ bitrix_debug_logs      │                   │
│  │ (WhatsApp)       │  │ (diagnóstico)          │                   │
│  └──────────────────┘  └────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Stack Tecnológica

| Componente | Tecnologia | Notas |
|------------|------------|-------|
| Backend | Supabase Edge Functions (Deno) | `verify_jwt = false` obrigatório |
| Database | PostgreSQL (Supabase) | RLS + JSONB para config |
| Frontend Bitrix | HTML renderizado por Edge Function | Headers CSP críticos |
| Frontend Web | React + TypeScript | Para dashboard fora do Bitrix |

### 1.3 Modelo de Dados Principal

```typescript
interface Bitrix24Config {
  // OAuth
  access_token: string;
  refresh_token: string;
  expires_at: string;  // ISO timestamp
  
  // Identificadores
  member_id: string;   // ID único do portal (NUNCA muda)
  domain: string;      // Ex: "empresa.bitrix24.com.br"
  client_endpoint: string; // Ex: "https://empresa.bitrix24.com.br/rest/"
  
  // Status de registro
  connector_registered: boolean;
  connector_active: boolean;
  robot_simple_registered: boolean;
  robot_meta_registered: boolean;
  sms_provider_registered: boolean;
  
  // Open Lines ativadas
  activated_lines?: Array<{
    line_id: number;
    line_name: string;
    active: boolean;
  }>;
}
```

---

## 2. Configuração Obrigatória

### 2.1 supabase/config.toml

```toml
# ⚠️ CRÍTICO: TODAS as funções Bitrix24 precisam verify_jwt = false
# Bitrix24 não envia JWT do Supabase nas requisições

[functions.bitrix24-install]
verify_jwt = false

[functions.bitrix24-register]
verify_jwt = false

[functions.bitrix24-connector-settings]
verify_jwt = false

[functions.bitrix24-events]
verify_jwt = false

[functions.bitrix24-webhook]
verify_jwt = false

[functions.bitrix24-worker]
verify_jwt = false

[functions.bitrix24-send]
verify_jwt = false

[functions.bitrix24-robot-handler]
verify_jwt = false

[functions.bitrix24-sms-handler]
verify_jwt = false
```

### 2.2 Secrets Necessários

| Secret | Descrição | Onde Obter |
|--------|-----------|------------|
| `BITRIX24_CLIENT_ID` | Client ID do app | Painel de Vendors Bitrix24 |
| `BITRIX24_CLIENT_SECRET` | Client Secret | Painel de Vendors Bitrix24 |
| `SUPABASE_URL` | URL do projeto | Auto-configurado |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key | Auto-configurado |

### 2.3 Escopos API Obrigatórios

Configure no Painel de Vendors:

```
crm                 # CRM completo
user                # Dados de usuários
imopenlines         # Open Lines
imconnector         # Conectores de mensagem
im                  # Mensagens instantâneas
imbot               # Bots
bizproc             # Robôs de automação
event               # Webhooks/eventos
messageservice      # Provedor SMS (opcional)
```

---

## 3. Headers CSP para Iframes

### 3.1 O PROBLEMA

O Bitrix24 renderiza seu app dentro de um `<iframe>`. Sem headers corretos:
- Tela branca
- Erro: "Refused to display in a frame"
- X-Frame-Options blocking

### 3.2 A SOLUÇÃO OBRIGATÓRIA

**Use estes headers em TODA função que retorna HTML:**

```typescript
const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "connect-src *",
  // ⚠️ CRÍTICO: frame-ancestors permite embedding
  "frame-ancestors 'self' https://*.bitrix24.com https://*.bitrix24.com.br https://*.bitrix24.eu https://*.bitrix24.es https://*.bitrix24.de https://*.bitrix24.ru",
  "font-src * data:"
].join('; ');

const htmlHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': cspValue,
  // ⚠️ NÃO USE X-Frame-Options - conflita com frame-ancestors
};
```

### 3.3 Meta Tag Fallback

Sempre inclua no HTML como backup (CDNs podem sobrescrever headers):

```html
<head>
  <meta http-equiv="Content-Security-Policy" 
        content="frame-ancestors 'self' https://*.bitrix24.com https://*.bitrix24.com.br https://*.bitrix24.eu;">
</head>
```

### 3.4 Teste de Iframe

Crie um endpoint de teste:

```typescript
// GET /functions/v1/bitrix24-iframe-test
// Deve mostrar "isInIframe: true" quando acessado do Bitrix24
```

---

## 4. Extração de Domínio

### 4.1 O PROBLEMA

O Bitrix24 envia o domínio de formas INCONSISTENTES:
- `auth.domain`
- `DOMAIN`
- `domain`
- Header `Referer`
- `client_endpoint`

**Se usar domínio errado, todas as chamadas REST falham.**

### 4.2 A SOLUÇÃO: Extração em Cascata

```typescript
function extractDomainFromRequest(data: any, req: Request): string | null {
  // 1. client_endpoint (se já salvamos antes)
  if (data.config?.client_endpoint) {
    const match = data.config.client_endpoint.match(/https?:\/\/([^\/]+)/);
    if (match) return match[1];
  }
  
  // 2. auth.domain (padrão OAuth)
  if (data.auth?.domain) {
    return cleanDomain(data.auth.domain);
  }
  
  // 3. DOMAIN ou domain (instalação)
  if (data.DOMAIN) return cleanDomain(data.DOMAIN);
  if (data.domain) return cleanDomain(data.domain);
  
  // 4. Referer header (fallback confiável)
  const referer = req.headers.get('referer');
  if (referer) {
    const match = referer.match(/https?:\/\/([^\/]+\.bitrix24\.[^\/]+)/);
    if (match) return match[1];
  }
  
  // 5. Origin header
  const origin = req.headers.get('origin');
  if (origin && origin.includes('bitrix24')) {
    return cleanDomain(origin);
  }
  
  return null;
}

function cleanDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '')  // Remove protocolo
    .replace(/\/.*$/, '')          // Remove path
    .replace(/:\d+$/, '')          // Remove porta
    .toLowerCase();
}

function isValidBitrixDomain(domain: string): boolean {
  const patterns = [
    /\.bitrix24\.com$/,
    /\.bitrix24\.com\.br$/,
    /\.bitrix24\.ru$/,
    /\.bitrix24\.eu$/,
    /\.bitrix24\.de$/,
    /\.bitrix24\.es$/,
  ];
  return patterns.some(p => p.test(domain));
}
```

---

## 5. Registro e Ativação do Conector

### 5.1 Fluxo Completo

```
1. Registrar conector (imconnector.register)
   ↓
2. Ativar em cada Open Line (imconnector.activate)
   ↓
3. Configurar dados do conector (imconnector.connector.data.set)
   ↓
4. Vincular eventos (event.bind)
```

### 5.2 Registro do Conector

```typescript
async function registerConnector(
  clientEndpoint: string,
  accessToken: string,
  supabaseUrl: string
): Promise<void> {
  
  // 1. Deletar versão antiga (para atualizar ícones)
  await callBitrix(clientEndpoint, accessToken, 'imconnector.unregister', {
    ID: 'seu_conector_id'
  });
  
  // 2. Registrar novo
  const result = await callBitrix(clientEndpoint, accessToken, 'imconnector.register', {
    ID: 'seu_conector_id',
    NAME: 'Seu Conector WhatsApp',
    ICON: {
      DATA_IMAGE: 'data:image/svg+xml;base64,...', // Ícone ativo
      COLOR: { BACKGROUND: '#25D366', BORDER: '#128C7E' },
      SIZE: { WIDTH: 48, HEIGHT: 48 },
      POSITION: { TOP: 0, LEFT: 0 }
    },
    ICON_DISABLED: {
      DATA_IMAGE: 'data:image/svg+xml;base64,...', // Ícone desativado (cinza)
    },
    PLACEMENT_HANDLER: `${supabaseUrl}/functions/v1/seu-connector-settings`,
  });
  
  // Ignorar erro se já existe
  if (result.error && result.error !== 'CONNECTOR_ALREADY_EXISTS') {
    throw new Error(`Falha ao registrar: ${result.error}`);
  }
}
```

### 5.3 Ativação nas Open Lines

```typescript
async function activateConnectorOnLines(
  clientEndpoint: string,
  accessToken: string
): Promise<void> {
  
  // 1. Listar Open Lines
  const linesResult = await callBitrix(
    clientEndpoint, 
    accessToken, 
    'imopenlines.config.list.get'
  );
  
  const lines = linesResult.result || [];
  
  // 2. Ativar em cada linha
  for (const line of lines) {
    await callBitrix(clientEndpoint, accessToken, 'imconnector.activate', {
      CONNECTOR: 'seu_conector_id',
      LINE: line.ID,
      ACTIVE: 1,
    });
    
    // 3. Configurar webhook do conector
    await callBitrix(clientEndpoint, accessToken, 'imconnector.connector.data.set', {
      CONNECTOR: 'seu_conector_id',
      LINE: line.ID,
      DATA: {
        id: 'seu_conector_id',
        url: 'https://sua-url/webhook',
        name: 'Seu Conector',
      }
    });
  }
}
```

### 5.4 Vincular Eventos

```typescript
async function bindEvents(
  clientEndpoint: string,
  accessToken: string,
  webhookUrl: string
): Promise<void> {
  
  const events = [
    'OnImConnectorMessageAdd',      // Operador envia mensagem
    'OnImConnectorDialogStart',     // Início de conversa
    'OnImConnectorDialogFinish',    // Fim de conversa
    'OnImConnectorStatusDelete',    // Conector desativado
  ];
  
  for (const event of events) {
    const result = await callBitrix(clientEndpoint, accessToken, 'event.bind', {
      event,
      handler: webhookUrl,
    });
    
    // ⚠️ IMPORTANTE: "Handler already binded" NÃO é erro
    if (result.error && !result.error.includes('already binded')) {
      console.error(`Falha ao vincular ${event}:`, result.error);
    }
  }
}
```

---

## 6. Mapeamento de Canais

### 6.1 Conceito Crítico

**Cada instância WhatsApp deve estar mapeada para UMA Open Line específica.**

Sem mapeamento correto:
- Mensagens não aparecem no Bitrix24
- Erro: "No active channel mapping found"

### 6.2 Tabela de Mapeamento

```sql
CREATE TABLE bitrix_channel_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  line_id INTEGER NOT NULL,        -- ID da Open Line no Bitrix24
  line_name TEXT,                  -- Nome para referência humana
  
  is_active BOOLEAN DEFAULT true,
  crm_auto_create BOOLEAN DEFAULT true,  -- Criar Lead/Deal automaticamente?
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Uma instância = Uma linha (por workspace)
  UNIQUE(instance_id, workspace_id)
);
```

### 6.3 Buscar Mapeamento com Auto-Correção

```typescript
async function getChannelMapping(
  supabase: any,
  instanceId: string,
  workspaceId: string,
  integration: any
): Promise<{ lineId: number; mapping: any } | null> {
  
  // 1. Buscar mapeamento existente
  const { data: mapping } = await supabase
    .from('bitrix_channel_mappings')
    .select('*')
    .eq('instance_id', instanceId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single();
  
  if (mapping) {
    // 2. Validar se linha ainda está ativa no Bitrix24
    const isLineActive = await checkLineIsActive(
      integration.config.client_endpoint,
      integration.config.access_token,
      mapping.line_id
    );
    
    if (isLineActive) {
      return { lineId: mapping.line_id, mapping };
    }
    
    // 3. Linha inativa - buscar outra automaticamente
    console.log('[AUTO-FIX] Mapeamento aponta para linha inativa, buscando alternativa...');
  }
  
  // 4. Buscar qualquer linha ativa com o conector
  const activeLine = await findActiveLineWithConnector(
    integration.config.client_endpoint,
    integration.config.access_token,
    'seu_conector_id'
  );
  
  if (activeLine) {
    // 5. Atualizar mapeamento automaticamente
    await supabase
      .from('bitrix_channel_mappings')
      .upsert({
        instance_id: instanceId,
        workspace_id: workspaceId,
        integration_id: integration.id,
        line_id: activeLine.ID,
        line_name: activeLine.LINE_NAME,
        is_active: true,
      });
    
    return { lineId: activeLine.ID, mapping: null };
  }
  
  return null;
}
```

---

## 7. Fluxo de Mensagens Bidirecional

### 7.1 WhatsApp → Bitrix24

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  WhatsApp   │────▶│ evolution-webhook │────▶│ ai-process-msg  │
│  (Cliente)  │     │ ou gupshup/meta  │     │ (opcional: IA)  │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                                                      ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Bitrix24   │◀────│  bitrix24-send   │◀────│ Salva mensagem  │
│  (Operador) │     │                  │     │ no banco        │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

**Função `bitrix24-send` deve:**
1. Buscar mapeamento de canal
2. Encontrar ou criar Lead/Deal
3. Enviar via `imconnector.send.messages`
4. Fallbacks: timeline comment, activity, notificação

### 7.2 Bitrix24 → WhatsApp

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Bitrix24   │────▶│ bitrix24-events  │────▶│ bitrix24-worker │
│ (Operador)  │     │ (webhook)        │     │ (processa)      │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                     ┌───── É mensagem do BOT? ───────┘
                     │
            ┌────────┴────────┐
            │                 │
           SIM               NÃO
            │                 │
            ▼                 ▼
    ┌──────────────┐  ┌──────────────────┐
    │ Envia status │  │ evolution-send   │
    │ de entrega   │  │ ou meta/gupshup  │
    └──────────────┘  └──────────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │  WhatsApp   │
                      │  (Cliente)  │
                      └─────────────┘
```

---

## 8. Prevenção de Loops e Duplicações

### 8.1 O PROBLEMA CRÍTICO

Sem detecção correta:
1. Bot responde mensagem
2. Bitrix24 recebe resposta do bot como "nova mensagem do operador"
3. Sistema reenvia para WhatsApp
4. Cliente recebe mensagem duplicada
5. Loop infinito em casos extremos

### 8.2 A SOLUÇÃO: Detecção de Mensagens do Bot

```typescript
// Em bitrix24-worker, ANTES de processar mensagem:

function isBotMessage(messageText: string): boolean {
  const BOT_PATTERNS = [
    '[b]ThothAI',           // Formato bold Bitrix
    'ThothAI -',            // Prefixo com hífen
    '*ThothAI',             // Formato markdown
    '[Assistente]',         // Marcador genérico
    // Adicione nomes das suas personas:
    'Larissa Assistente',
    'Carlos Vendas',
    // etc.
  ];
  
  return BOT_PATTERNS.some(pattern => 
    messageText.includes(pattern) || 
    messageText.startsWith(pattern)
  );
}

// No processamento:
if (isBotMessage(messageText)) {
  console.log('[SKIP] Mensagem é do próprio bot, apenas enviando status');
  
  // Apenas confirma entrega, NÃO reenvia
  await callBitrix(endpoint, token, 'imconnector.send.status.delivery', {
    CONNECTOR: 'seu_conector_id',
    LINE: lineId,
    MESSAGES: [{ im_id: messageId, date: new Date().toISOString() }]
  });
  
  return; // NÃO processa como mensagem normal
}
```

### 8.3 Lock de Processamento

Para evitar race conditions:

```typescript
async function tryAcquireLock(
  supabase: any, 
  conversationId: string
): Promise<boolean> {
  const lockKey = `processing_${conversationId}`;
  const now = Date.now();
  const lockTimeout = 30000; // 30 segundos
  
  // Tentar adquirir lock
  const { data, error } = await supabase
    .from('conversations')
    .update({ 
      processing_lock: now,
      updated_at: new Date().toISOString()
    })
    .eq('id', conversationId)
    .or(`processing_lock.is.null,processing_lock.lt.${now - lockTimeout}`)
    .select();
  
  return data && data.length > 0;
}

async function releaseLock(supabase: any, conversationId: string): Promise<void> {
  await supabase
    .from('conversations')
    .update({ processing_lock: null })
    .eq('id', conversationId);
}
```

---

## 9. Sistema de Auto-Reparo

### 9.1 Quando Aplicar

Aplique auto-reparo quando:
- Linha mapeada está inativa
- Fila de operadores está vazia
- Configurações críticas estão erradas

### 9.2 Função de Reparo Agressivo

```typescript
async function autoRepairOpenLine(
  clientEndpoint: string,
  accessToken: string,
  lineId: number
): Promise<boolean> {
  
  console.log(`[AUTO-REPAIR] Iniciando reparo da linha ${lineId}`);
  
  try {
    // 1. Forçar ativação da linha
    await callBitrix(clientEndpoint, accessToken, 'imopenlines.config.update', {
      CONFIG_ID: lineId,
      PARAMS: {
        ACTIVE: 'Y',
        CRM_CREATE: 'lead',      // Criar leads automaticamente
        CRM_TRANSFER: 'Y',       // Transferir para CRM
        TIMEMAN: 'N',            // ⚠️ Ignorar horário comercial
        CHECK_AVAILABLE: 'N',    // ⚠️ Ignorar disponibilidade
        QUEUE_TYPE: 'evenly',    // Distribuição uniforme
      }
    });
    
    // 2. Verificar fila de operadores
    const lineConfig = await callBitrix(
      clientEndpoint, 
      accessToken, 
      'imopenlines.config.get', 
      { CONFIG_ID: lineId }
    );
    
    const queue = lineConfig.result?.QUEUE || [];
    
    // 3. Se fila vazia, adicionar funcionários
    if (queue.length === 0) {
      const users = await callBitrix(clientEndpoint, accessToken, 'user.get', {
        FILTER: { ACTIVE: true },
        start: 0
      });
      
      const userIds = (users.result || [])
        .slice(0, 10)  // Máximo 10 operadores
        .map((u: any) => u.ID);
      
      if (userIds.length > 0) {
        await callBitrix(clientEndpoint, accessToken, 'imopenlines.config.update', {
          CONFIG_ID: lineId,
          PARAMS: { QUEUE: userIds }
        });
        console.log(`[AUTO-REPAIR] Adicionados ${userIds.length} operadores à fila`);
      }
    }
    
    // 4. Reativar conector na linha
    await callBitrix(clientEndpoint, accessToken, 'imconnector.activate', {
      CONNECTOR: 'seu_conector_id',
      LINE: lineId,
      ACTIVE: 1,
    });
    
    console.log('[AUTO-REPAIR] Reparo concluído com sucesso');
    return true;
    
  } catch (error) {
    console.error('[AUTO-REPAIR] Falha:', error);
    return false;
  }
}
```

### 9.3 Fallback de Entrega

Se `imconnector.send.messages` falhar:

```typescript
async function sendWithFallbacks(
  clientEndpoint: string,
  accessToken: string,
  lineId: number,
  message: string,
  entityInfo: { type: string; id: string }
): Promise<boolean> {
  
  // 1. Tentativa principal: imconnector.send.messages
  const primary = await callBitrix(clientEndpoint, accessToken, 'imconnector.send.messages', {
    CONNECTOR: 'seu_conector_id',
    LINE: lineId,
    MESSAGES: [{
      im_id: Date.now().toString(),
      user: { id: 'external', name: 'Cliente' },
      message: { text: message },
      date: new Date().toISOString(),
    }]
  });
  
  if (!primary.error) return true;
  
  // 2. Fallback 1: Comentário no timeline
  console.log('[FALLBACK] Usando timeline comment');
  const comment = await callBitrix(clientEndpoint, accessToken, 'crm.timeline.comment.add', {
    fields: {
      ENTITY_ID: entityInfo.id,
      ENTITY_TYPE: entityInfo.type.toUpperCase(),
      COMMENT: `📱 WhatsApp: ${message}`,
      AUTHOR_ID: 0,
    }
  });
  
  if (!comment.error) return true;
  
  // 3. Fallback 2: Atividade TODO
  console.log('[FALLBACK] Usando crm.activity.todo.add');
  const activity = await callBitrix(clientEndpoint, accessToken, 'crm.activity.todo.add', {
    ownerTypeId: entityInfo.type === 'lead' ? 1 : 2,
    ownerId: parseInt(entityInfo.id),
    description: `📱 Nova mensagem WhatsApp:\n\n${message}`,
    deadline: new Date(Date.now() + 3600000).toISOString(),
    colorId: 3, // Verde para WhatsApp
  });
  
  if (!activity.error) return true;
  
  // 4. Fallback 3: Notificação para operadores
  console.log('[FALLBACK] Enviando notificação');
  await callBitrix(clientEndpoint, accessToken, 'im.notify.system.add', {
    USER_ID: 1, // Admin
    MESSAGE: `📱 Nova mensagem WhatsApp não entregue: ${message.substring(0, 100)}...`,
  });
  
  return false;
}
```

---

## 10. Open Lines - Configuração Crítica

### 10.1 Parâmetros Obrigatórios

| Parâmetro | Valor | Motivo |
|-----------|-------|--------|
| `ACTIVE` | `Y` | Linha deve estar ativa |
| `TIMEMAN` | `N` | Não bloquear por horário |
| `CHECK_AVAILABLE` | `N` | Não verificar disponibilidade |
| `CRM_CREATE` | `lead` ou `deal` | Criar entidades automaticamente |
| `CRM_TRANSFER` | `Y` | Transferir para CRM |

### 10.2 Verificar Saúde da Linha

```typescript
async function checkLineHealth(
  clientEndpoint: string,
  accessToken: string,
  lineId: number
): Promise<{ healthy: boolean; issues: string[] }> {
  
  const issues: string[] = [];
  
  const config = await callBitrix(
    clientEndpoint, 
    accessToken, 
    'imopenlines.config.get', 
    { CONFIG_ID: lineId }
  );
  
  if (!config.result) {
    return { healthy: false, issues: ['Linha não encontrada'] };
  }
  
  const line = config.result;
  
  // Verificações
  if (line.ACTIVE !== 'Y') {
    issues.push('Linha INATIVA');
  }
  
  if (!line.QUEUE || line.QUEUE.length === 0) {
    issues.push('Fila de operadores VAZIA');
  }
  
  if (line.TIMEMAN === 'Y') {
    issues.push('TIMEMAN ativo (pode bloquear fora do horário)');
  }
  
  if (line.CHECK_AVAILABLE === 'Y') {
    issues.push('CHECK_AVAILABLE ativo (pode bloquear operadores ocupados)');
  }
  
  return {
    healthy: issues.length === 0,
    issues
  };
}
```

---

## 11. Detecção de Modo CRM

### 11.1 O PROBLEMA

O Bitrix24 tem dois modos de CRM:
- **Clássico**: Leads → Deals (converte)
- **Simples**: Apenas Deals (sem Leads)

Se tentar criar Lead em modo Simples, falha silenciosamente.

### 11.2 A SOLUÇÃO

```typescript
async function detectCrmMode(
  clientEndpoint: string,
  accessToken: string
): Promise<'classic' | 'simple'> {
  
  const result = await callBitrix(
    clientEndpoint, 
    accessToken, 
    'crm.settings.mode.get'
  );
  
  // result.result: 0 = Clássico, 2 = Simples
  const isSimple = result.result === 2;
  
  return isSimple ? 'simple' : 'classic';
}

// Uso:
const crmMode = await detectCrmMode(endpoint, token);
const entityType = crmMode === 'simple' ? 'deal' : 'lead';

// Criar entidade correta
if (entityType === 'lead') {
  await createLead(...);
} else {
  await createDeal(...);
}
```

---

## 12. Token Refresh Automático

### 12.1 Lógica de Refresh

```typescript
async function ensureValidToken(
  supabase: any,
  integration: any
): Promise<string> {
  
  const config = integration.config;
  const expiresAt = new Date(config.expires_at);
  const now = new Date();
  const bufferMinutes = 5;
  
  // Token ainda válido?
  if (expiresAt.getTime() - now.getTime() > bufferMinutes * 60 * 1000) {
    return config.access_token;
  }
  
  console.log('[TOKEN] Renovando access_token...');
  
  // Chamar OAuth refresh
  const response = await fetch('https://oauth.bitrix.info/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('BITRIX24_CLIENT_ID')!,
      client_secret: Deno.env.get('BITRIX24_CLIENT_SECRET')!,
      refresh_token: config.refresh_token,
    }),
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }
  
  // Atualizar no banco
  const newConfig = {
    ...config,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  
  await supabase
    .from('integrations')
    .update({ config: newConfig, updated_at: new Date().toISOString() })
    .eq('id', integration.id);
  
  console.log('[TOKEN] Token renovado com sucesso');
  return data.access_token;
}
```

---

## 13. Multi-Binding para CRM

### 13.1 Conceito

Quando um contato tem múltiplos Deals/Leads abertos, a atividade deve aparecer em TODOS eles, não apenas no mais recente.

### 13.2 Implementação

```typescript
async function bindActivityToMultipleEntities(
  clientEndpoint: string,
  accessToken: string,
  activityId: number,
  entityType: 'lead' | 'deal',
  entityIds: string[]
): Promise<void> {
  
  if (entityIds.length <= 1) return; // Nada a vincular
  
  // Primeira entidade já está vinculada (criação)
  const additionalIds = entityIds.slice(1);
  
  // Usar Batch API para eficiência
  const batchSize = 50;
  
  for (let i = 0; i < additionalIds.length; i += batchSize) {
    const batch = additionalIds.slice(i, i + batchSize);
    
    const commands: Record<string, string> = {};
    batch.forEach((entityId, idx) => {
      commands[`bind_${idx}`] = `crm.activity.binding.add?activityId=${activityId}&entityTypeId=${entityType === 'lead' ? 1 : 2}&entityId=${entityId}`;
    });
    
    const result = await callBitrix(clientEndpoint, accessToken, 'batch', {
      cmd: commands
    });
    
    // Ignorar erros de "já vinculado"
    for (const [key, response] of Object.entries(result.result?.result || {})) {
      if ((response as any).error && !(response as any).error.includes('ALREADY_BOUND')) {
        console.warn(`[BIND] Erro em ${key}:`, (response as any).error);
      }
    }
  }
  
  console.log(`[BIND] Atividade ${activityId} vinculada a ${entityIds.length} entidades`);
}
```

---

## 14. Vinculação Workspace-Integração

### 14.1 Fluxo de Onboarding

```
1. Usuário instala app do Marketplace
   ↓
2. bitrix24-install cria integração com workspace_id = NULL
   ↓
3. Usuário é redirecionado para criar conta ou logar
   ↓
4. Trigger handle_new_user vincula automaticamente
   ↓
5. Usuário retorna ao Bitrix24, vê interface completa
```

### 14.2 Trigger de Vinculação Automática

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_workspace_id UUID;
  bitrix_int_id UUID;
BEGIN
  -- 1. Criar workspace
  INSERT INTO public.workspaces (owner_id, name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', 'Meu Workspace'))
  RETURNING id INTO new_workspace_id;
  
  -- 2. Adicionar como membro
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, new.id, 'owner');
  
  -- 3. Vincular integração Bitrix24 pendente (se existir)
  bitrix_int_id := (new.raw_user_meta_data->>'bitrix_integration_id')::UUID;
  
  IF bitrix_int_id IS NOT NULL THEN
    UPDATE public.integrations 
    SET workspace_id = new_workspace_id, updated_at = now()
    WHERE id = bitrix_int_id AND workspace_id IS NULL;
  END IF;
  
  RETURN new;
END;
$$;
```

### 14.3 Página de Cadastro com integration_id

```typescript
// AuthBitrix.tsx
const handleSignUp = async () => {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        bitrix_integration_id: integrationId,  // ⚠️ Chave para trigger
        bitrix_domain: domain,
      },
    },
  });
};
```

---

## 15. Erros Comuns e Soluções

### Tabela de Referência Rápida

| Erro | Causa | Solução |
|------|-------|---------|
| Tela branca no iframe | Headers CSP incorretos | Seção 3 |
| "Invalid domain" | Extração de domínio errada | Seção 4 |
| "No active channel mapping" | Mapeamento não existe | Seção 6 |
| Mensagens duplicadas | Bot não detectado | Seção 8 |
| "Handler already binded" | Não é erro real | Tratar como sucesso |
| Open Line sem operadores | Fila vazia | Auto-reparo, Seção 9 |
| Atividade não aparece no CRM | Modo CRM incorreto | Seção 11 |
| Token expirado | Refresh não implementado | Seção 12 |
| Lead não criado | Portal em modo Simples | Usar Deal |
| Loop infinito de mensagens | Mensagem do bot não detectada | Seção 8 |

### Checklist de Diagnóstico

```bash
# 1. Verificar mapeamento
SELECT * FROM bitrix_channel_mappings WHERE workspace_id = 'XXX';

# 2. Verificar integração
SELECT id, config->>'member_id', config->>'domain', 
       config->>'connector_active', workspace_id
FROM integrations WHERE type = 'bitrix24';

# 3. Verificar instância
SELECT id, name, status, phone_number FROM instances WHERE workspace_id = 'XXX';

# 4. Verificar logs recentes
SELECT * FROM bitrix_debug_logs 
WHERE workspace_id = 'XXX' 
ORDER BY timestamp DESC LIMIT 20;
```

---

## 16. Checklist de Deploy

### Antes de Publicar

- [ ] `verify_jwt = false` em TODAS as funções Bitrix24
- [ ] Secrets `BITRIX24_CLIENT_ID` e `BITRIX24_CLIENT_SECRET` configurados
- [ ] Headers CSP incluem TODOS os domínios Bitrix24
- [ ] Extração de domínio usa múltiplos fallbacks
- [ ] Detecção de mensagens do bot implementada
- [ ] Auto-reparo de Open Lines implementado
- [ ] Token refresh automático funciona
- [ ] Mapeamento de canais com auto-correção
- [ ] Detecção de modo CRM (Lead vs Deal)
- [ ] Multi-binding para atividades

### Teste End-to-End

1. [ ] Instalar app do Marketplace
2. [ ] Criar conta via fluxo AuthBitrix
3. [ ] Verificar workspace vinculado
4. [ ] Conectar instância WhatsApp
5. [ ] Mapear para Open Line
6. [ ] Enviar mensagem do WhatsApp → Aparece no Bitrix
7. [ ] Responder pelo Bitrix → Cliente recebe
8. [ ] Verificar: SEM duplicação
9. [ ] Testar IA responder → SEM loop
10. [ ] Verificar Lead/Deal criado corretamente

---

## 17. Templates de Código

### 17.1 Helper para Chamar API Bitrix24

```typescript
async function callBitrix(
  clientEndpoint: string,
  accessToken: string,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  
  const url = `${clientEndpoint}${method}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      auth: accessToken,
    }),
  });
  
  const data = await response.json();
  
  if (data.error && data.error !== 'CONNECTOR_ALREADY_EXISTS') {
    console.error(`[BITRIX API] ${method} error:`, data.error, data.error_description);
  }
  
  return data;
}
```

### 17.2 Base Template para Edge Function

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "frame-ancestors 'self' https://*.bitrix24.com https://*.bitrix24.com.br https://*.bitrix24.eu",
].join('; ');

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse flexível
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    let data: Record<string, any> = {};

    if (bodyText) {
      if (contentType.includes("application/json")) {
        data = JSON.parse(bodyText);
      } else {
        const params = new URLSearchParams(bodyText);
        for (const [key, value] of params.entries()) {
          // Suporte a notação PHP array: auth[domain]
          const match = key.match(/^(\w+)\[(\w+)\]$/);
          if (match) {
            if (!data[match[1]]) data[match[1]] = {};
            data[match[1]][match[2]] = value;
          } else {
            data[key] = value;
          }
        }
      }
    }

    // Sua lógica aqui...

    return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });

  } catch (error) {
    console.error("[ERROR]", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
```

---

## 📝 Notas Finais

### Princípios Chave

1. **Defensivo**: Sempre assuma que dados podem estar incorretos ou ausentes
2. **Auto-curativo**: Implemente auto-reparo para problemas comuns
3. **Logging extensivo**: Log tudo para diagnóstico posterior
4. **Fallbacks**: Sempre tenha plano B (e C) para operações críticas
5. **Idempotente**: Operações devem ser seguras para repetir

### Documentação Relacionada

- `docs/BITRIX24_TROUBLESHOOTING_GUIDE.md` - Guia de problemas específicos
- `docs/BITRIX24_SCALING_CHECKLIST.md` - Checklist para novas empresas
- [API Bitrix24](https://dev.1c-bitrix.ru/rest_help/)
- [Marketplace Bitrix24](https://vendors.bitrix24.com/)

---

*Este documento deve ser a primeira referência ao criar qualquer nova integração Bitrix24. Atualize sempre que novos problemas forem resolvidos.*
