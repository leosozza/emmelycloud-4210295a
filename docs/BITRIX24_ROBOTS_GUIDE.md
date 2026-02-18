# Guia Completo: Criando Aplicativos com Robots para o Bitrix24
> Manual técnico para desenvolvedores que desejam criar, publicar e manter aplicativos de automação (robots) no ecossistema Bitrix24.
---
## Sumário
1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Criando o Aplicativo no Bitrix24](#3-criando-o-aplicativo-no-bitrix24)
4. [Fluxo de Instalação (OAuth)](#4-fluxo-de-instalação-oauth)
5. [Registrando Robots via API](#5-registrando-robots-via-api)
6. [Processando Eventos dos Robots](#6-processando-eventos-dos-robots)
7. [Agendamento e Execução de Tarefas](#7-agendamento-e-execução-de-tarefas)
8. [Placements e Background Workers](#8-placements-e-background-workers)
9. [Publicando na Conta Vendors](#9-publicando-na-conta-vendors)
10. [Evitando Erros e Bugs Comuns](#10-evitando-erros-e-bugs-comuns)
11. [Manual de Boas Práticas](#11-manual-de-boas-práticas)
12. [Troubleshooting](#12-troubleshooting)
13. [Referências](#13-referências)
---
## 1. Visão Geral da Arquitetura
### Como funciona um aplicativo Bitrix24 com robots
```
┌─────────────────────────────────────┐
│          Bitrix24 Portal            │
│                                     │
│  ┌──────────┐   ┌───────────────┐   │
│  │ Workflow  │──▶│  Robot (seu)  │   │
│  │ (CRM)    │   │  registrado   │   │
│  └──────────┘   └───────┬───────┘   │
│                         │           │
└─────────────────────────┼───────────┘
                          │ HTTP POST (evento)
                          ▼
              ┌───────────────────────┐
              │   Seu Backend (API)   │
              │                       │
              │  • Recebe evento      │
              │  • Processa lógica    │
              │  • Agenda ações       │
              │  • Responde ao Bitrix │
              └───────────────────────┘
```
### Componentes principais
| Componente | Descrição |
|---|---|
| **Aplicativo Bitrix24** | Entidade registrada no marketplace ou como app local |
| **OAuth Handler** | Endpoint que gerencia instalação e tokens |
| **Robot Handler** | Endpoint que recebe eventos quando o robot é acionado no workflow |
| **Event Processor** | Lógica de processamento de eventos agendados |
| **Background Worker** | Widget invisível que roda no navegador do usuário (opcional) |
---
## 2. Pré-requisitos
### Conta e ambiente
- [ ] Conta no [Bitrix24](https://www.bitrix24.com.br/) (gratuita para desenvolvimento)
- [ ] Conta de desenvolvedor em [vendors.bitrix24.com](https://vendors.bitrix24.com)
- [ ] Backend com HTTPS (obrigatório para endpoints de produção)
- [ ] Banco de dados para armazenar tokens e configurações
### Escopos obrigatórios
Para trabalhar com robots de automação, seu aplicativo **precisa** dos seguintes escopos:
| Escopo | Finalidade |
|---|---|
| `bizproc` | **Obrigatório** — Registrar e gerenciar robots de automação |
| `crm` | Acessar dados de leads, deals, contatos |
| `placement` | Registrar widgets e background workers |
| `im` | Enviar notificações nativas (sino) |
| `user` | Obter dados do usuário logado |
> ⚠️ **CRÍTICO**: Sem o escopo `bizproc`, qualquer tentativa de registrar ou atualizar robots via API falhará com erro `insufficient_scope`.
---
## 3. Criando o Aplicativo no Bitrix24
### 3.1 Aplicativo Local (desenvolvimento)
1. Acesse seu portal Bitrix24
2. Vá em **Aplicativos → Desenvolvedores → Outro → Aplicativo local**
3. Preencha:
   - **Nome**: Nome do seu aplicativo
   - **URL do handler**: `https://seu-backend.com/api/bitrix-install`
   - **URL do widget**: `https://seu-backend.com/api/popup-widget` (se usar placements)
   - **Permissões**: Selecione `bizproc`, `crm`, `placement`, `im`, `user`
4. Salve e copie o `client_id` e `client_secret`
### 3.2 Estrutura de URLs necessárias
```
https://seu-backend.com/
├── /api/bitrix-install      ← Handler de instalação (OAuth)
├── /api/bitrix-auth         ← Callback OAuth (se aplicável)
├── /api/bitrix-robot-handler ← Recebe eventos dos robots
├── /api/popup-widget        ← Background worker (opcional)
└── /api/popup-widget/check  ← Endpoint de verificação (opcional)
```
---
## 4. Fluxo de Instalação (OAuth)
### Fluxo completo de instalação
```
Usuário clica "Instalar"
        │
        ▼
Bitrix24 envia POST para seu handler
        │
        ├── Payload contém:
        │   • auth[access_token]
        │   • auth[refresh_token]
        │   • auth[client_endpoint]  ← IMPORTANTE!
        │   • auth[member_id]
        │   • auth[domain]
        │   • auth[expires_in]
        │
        ▼
Seu backend:
  1. Salva tokens no banco
  2. Registra robots via API
  3. Registra placements (opcional)
  4. Retorna HTML de confirmação
```
### Payload de instalação (exemplo)
```json
{
  "event": "ONAPPINSTALL",
  "auth": {
    "access_token": "abc123...",
    "refresh_token": "def456...",
    "client_endpoint": "https://portal.bitrix24.com.br/rest/",
    "member_id": "a1b2c3d4...",
    "domain": "portal.bitrix24.com.br",
    "expires_in": 3600,
    "application_token": "xyz789..."
  }
}
```
### Implementação do handler de instalação
```typescript
async function handleInstall(request) {
  const formData = await request.formData();
  // Extrair dados do payload
  const accessToken = formData.get("auth[access_token]");
  const refreshToken = formData.get("auth[refresh_token]");
  const clientEndpoint = formData.get("auth[client_endpoint]");
  const memberId = formData.get("auth[member_id]");
  const domain = formData.get("auth[domain]");
  const expiresIn = parseInt(formData.get("auth[expires_in]") || "3600");
  // 1. Salvar credenciais no banco de dados
  await saveAccount({
    domain,
    member_id: memberId,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + expiresIn * 1000),
  });
  // 2. Registrar robots
  await registerRobots(clientEndpoint, accessToken);
  // 3. Registrar placements (opcional)
  await registerPlacements(clientEndpoint, accessToken);
  // 4. Retornar HTML de sucesso
  return new Response(
    `<html>
      <head>
        <script src="https://api.bitrix24.com/api/v1/"></script>
      </head>
      <body>
        <script>BX24.init(() => BX24.installFinish());</script>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
```
> ⚠️ **IMPORTANTE**: Use sempre o `client_endpoint` fornecido no payload de instalação para chamadas REST, **não** o endpoint OAuth genérico. Exemplo correto: `https://portal.bitrix24.com.br/rest/`.
---
## 5. Registrando Robots via API
### 5.1 Método `bizproc.robot.add`
```typescript
async function registerRobot(clientEndpoint, accessToken, robotConfig) {
  const response = await fetch(`${clientEndpoint}bizproc.robot.add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: accessToken,
      CODE: robotConfig.code,
      HANDLER: robotConfig.handlerUrl,
      NAME: robotConfig.name,
      AUTH_USER_ID: 1,
      USE_SUBSCRIPTION: "Y",        // Robot aguarda resposta
      USE_PLACEMENT: "N",
      PROPERTIES: robotConfig.properties || {},
      RETURN_PROPERTIES: robotConfig.returnProperties || {},
    }),
  });
  return await response.json();
}
```
### 5.2 Estrutura de propriedades do robot
As propriedades definem os campos que o usuário configura ao adicionar o robot no workflow:
```typescript
const robotProperties = {
  delay_value: {
    Name: {
      pt_br: "Tempo de espera",
      en: "Delay time",
    },
    Description: {
      pt_br: "Valor do tempo de espera",
      en: "Delay time value",
    },
    Type: "int",
    Required: "Y",
    Default: "1",
  },
  delay_unit: {
    Name: {
      pt_br: "Unidade de tempo",
      en: "Time unit",
    },
    Type: "select",
    Options: {
      seconds: "Segundos",
      minutes: "Minutos",
      hours: "Horas",
      days: "Dias",
    },
    Default: "hours",
  },
};
```
### 5.3 Propriedades de retorno
Definem os valores que seu robot devolve ao workflow após o processamento:
```typescript
const returnProperties = {
  scheduled_at: {
    Name: { pt_br: "Agendado para", en: "Scheduled at" },
    Type: "datetime",
  },
  completed_at: {
    Name: { pt_br: "Concluído em", en: "Completed at" },
    Type: "datetime",
  },
  status: {
    Name: { pt_br: "Status", en: "Status" },
    Type: "string",
  },
};
```
### 5.4 Tipos de propriedades suportados
| Tipo | Descrição | Exemplo |
|---|---|---|
| `string` | Texto livre | Nome, mensagem |
| `text` | Texto multilinha | Descrição longa |
| `int` | Número inteiro | Quantidade, delay |
| `double` | Número decimal | Percentual |
| `bool` | Sim/Não (Y/N) | Ativar/desativar |
| `date` | Data | Data alvo |
| `datetime` | Data e hora | Agendamento |
| `select` | Lista de opções | Unidade de tempo |
| `user` | Seletor de usuário | Responsável |
---
## 6. Processando Eventos dos Robots
### 6.1 Recebendo o evento
Quando o robot é acionado no workflow, o Bitrix24 envia um POST para o `HANDLER` configurado:
```typescript
async function handleRobotEvent(request) {
  const formData = await request.formData();
  // Dados do evento
  const code = formData.get("code");                    // Código do robot
  const eventToken = formData.get("event_token");       // Token para resposta
  const documentId = JSON.parse(formData.get("document_id") || "[]");
  const documentType = JSON.parse(formData.get("document_type") || "[]");
  // Propriedades configuradas pelo usuário
  const properties = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("properties[")) {
      const propName = key.match(/properties\[(\w+)\]/)?.[1];
      if (propName) properties[propName] = value;
    }
  }
  // Dados de autenticação
  const accessToken = formData.get("auth[access_token]");
  const refreshToken = formData.get("auth[refresh_token]");
  const clientEndpoint = formData.get("auth[client_endpoint]");
  const memberId = formData.get("auth[member_id]");
  const domain = formData.get("auth[domain]");
  // Processar conforme o tipo de robot
  switch (code) {
    case "smart_pause":
      return await handleSmartPause(/* params */);
    case "schedule_future_action":
      return await handleScheduleFuture(/* params */);
    default:
      return new Response("Unknown robot", { status: 400 });
  }
}
```
### 6.2 Respondendo ao Bitrix (bizproc.event.send)
Quando o robot usa `USE_SUBSCRIPTION: "Y"`, ele **aguarda** sua resposta antes de continuar o workflow:
```typescript
async function sendEventResponse(clientEndpoint, accessToken, eventToken, returnValues) {
  const response = await fetch(`${clientEndpoint}bizproc.event.send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: accessToken,
      EVENT_TOKEN: eventToken,
      RETURN_VALUES: returnValues,
    }),
  });
  return await response.json();
}
// Exemplo de uso
await sendEventResponse(
  "https://portal.bitrix24.com.br/rest/",
  "abc123access",
  "event_token_xyz",
  {
    scheduled_at: "2025-01-15T10:00:00Z",
    completed_at: new Date().toISOString(),
    status: "completed",
  }
);
```
### 6.3 Armazenando o callback para resposta futura
Para robots que precisam agendar ações futuras (pausa, retry, etc.), armazene as informações de callback:
```typescript
// Formato recomendado para armazenar callback info
const callbackString = [
  entityId,          // ID da entidade (deal, lead)
  eventToken,        // Token do evento (pode conter caracteres especiais)
  clientEndpoint,    // Endpoint REST do portal
  accessToken,       // Token de acesso atual
].join(":::");       // Separador seguro (evite | pois event_token pode contê-lo)
// Salvar no banco
await db.insert("scheduled_events", {
  rule_id: ruleId,
  entity_id: callbackString,    // Armazena toda info necessária
  scheduled_at: targetDate,
  status: "pending",
});
```
> ⚠️ **ATENÇÃO**: O `event_token` do Bitrix24 pode conter o caractere `|` internamente. Use `:::` como separador ao serializar os dados de callback para evitar erros de parsing.
---
## 7. Agendamento e Execução de Tarefas
### 7.1 Usando pg_cron (PostgreSQL)
Para processar eventos agendados automaticamente, configure um job cron que execute a cada minuto:
```sql
-- Habilitar extensão pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Agendar processamento a cada minuto
SELECT cron.schedule(
  'process-scheduled-events',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://seu-backend.com/api/process-scheduled-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <service_role_key>'
      ),
      body := '{}'::jsonb
    );
  $$
);
```
### 7.2 Fluxo de processamento
```
┌─────────────────────────────────────────┐
│            A cada 1 minuto              │
│                                         │
│  1. Buscar eventos com                  │
│     status = 'pending' AND              │
│     scheduled_at <= NOW()               │
│                                         │
│  2. Para cada evento:                   │
│     a. Marcar como 'processing'         │
│     b. Recuperar dados do callback      │
│     c. Verificar/renovar access_token   │
│     d. Chamar bizproc.event.send        │
│     e. Marcar como 'completed'          │
│                                         │
│  3. Em caso de erro:                    │
│     a. Incrementar retry_count          │
│     b. Se < max_retries: 'pending'      │
│     c. Se >= max_retries: 'failed'      │
│                                         │
└─────────────────────────────────────────┘
```
### 7.3 Renovação de tokens
Tokens do Bitrix24 expiram após 1 hora. Implemente refresh automático:
```typescript
async function refreshToken(accountId, currentRefreshToken) {
  const response = await fetch(
    `https://oauth.bitrix.info/oauth/token/?` +
    `grant_type=refresh_token&` +
    `client_id=${CLIENT_ID}&` +
    `client_secret=${CLIENT_SECRET}&` +
    `refresh_token=${currentRefreshToken}`
  );
  const data = await response.json();
  if (data.access_token) {
    // Salvar novos tokens no banco
    await updateAccount(accountId, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000),
    });
    return data.access_token;
  }
  throw new Error("Token refresh failed: " + JSON.stringify(data));
}
```
---
## 8. Placements e Background Workers
### 8.1 Registrando um Background Worker
O `PAGE_BACKGROUND_WORKER` permite executar código JavaScript em segundo plano em todas as páginas do Bitrix24:
```typescript
async function registerBackgroundWorker(clientEndpoint, accessToken, handlerUrl) {
  const response = await fetch(`${clientEndpoint}placement.bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: accessToken,
      PLACEMENT: "PAGE_BACKGROUND_WORKER",
      HANDLER: handlerUrl,
      OPTIONS: {
        errorHandlerUrl: handlerUrl,   // ← OBRIGATÓRIO!
      },
    }),
  });
  return await response.json();
}
```
> ⚠️ **OBRIGATÓRIO**: O campo `errorHandlerUrl` em `OPTIONS` é obrigatório para o registro de `PAGE_BACKGROUND_WORKER`. Sem ele, o registro falhará silenciosamente.
### 8.2 Implementando o Background Worker
O endpoint do worker deve servir HTML em requisições GET/POST (carregamento inicial pelo Bitrix) e JSON em sub-rotas:
```typescript
async function handlePopupWidget(request) {
  const url = new URL(request.url);
  // Sub-rota: retorna dados JSON
  if (url.pathname.endsWith("/check")) {
    const notifications = await getPendingNotifications(portalDomain, userId);
    return new Response(JSON.stringify(notifications), {
      headers: { "Content-Type": "application/json" },
    });
  }
  // Rota raiz: retorna HTML/JS do worker
  return new Response(`
    <html>
    <head>
      <script src="https://api.bitrix24.com/api/v1/"></script>
    </head>
    <body>
      <script>
        BX24.init(function() {
          // Verificar notificações periodicamente
          setInterval(async function() {
            try {
              const response = await fetch('${BASE_URL}/popup-widget/check?' +
                'domain=' + encodeURIComponent(BX24.getDomain()) +
                '&user_id=' + BX24.placement.info().options.USER_ID
              );
              const data = await response.json();
              if (data.hasNotifications) {
                // Abrir slider com a notificação
                BX24.openApplication({
                  width: 440,
                  height: 480,
                }, function() {
                  // Callback quando o slider fecha
                });
              }
            } catch (e) {
              console.error('Check failed:', e);
            }
          }, 30000); // A cada 30 segundos
        });
      </script>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}
```
---
## 9. Publicando na Conta Vendors
### 9.1 Criando conta no Bitrix24 Marketplace
1. Acesse [vendors.bitrix24.com](https://vendors.bitrix24.com)
2. Registre-se como desenvolvedor/empresa
3. Preencha os dados da empresa (CNPJ, endereço, contato)
4. Aguarde a aprovação (pode levar alguns dias úteis)
### 9.2 Preparando o aplicativo para publicação
#### Checklist obrigatório
- [ ] **HTTPS obrigatório** em todos os endpoints
- [ ] **Escopos corretos** definidos no aplicativo
- [ ] **Tratamento de erros** em todos os handlers
- [ ] **Logs estruturados** para diagnóstico
- [ ] **Renovação automática** de tokens
- [ ] **Testes** em pelo menos 3 portais diferentes
- [ ] **Idiomas**: Nomes e descrições em PT-BR e EN (mínimo)
- [ ] **Ícone** do aplicativo (512x512px, PNG)
- [ ] **Screenshots** do funcionamento (mínimo 3)
- [ ] **Descrição detalhada** do que o app faz
- [ ] **Política de privacidade** (URL)
- [ ] **Termos de uso** (URL)
### 9.3 Publicando a versão
1. Em vendors.bitrix24.com, vá em **Minhas Aplicações → Adicionar**
2. Escolha o tipo: **Aplicativo de servidor**
3. Preencha:
   - **URL do handler**: URL de instalação de produção
   - **Permissões**: Selecione os escopos necessários
   - **Idiomas**: Adicione nomes e descrições localizados
4. Envie para **revisão**
5. A equipe do Bitrix24 revisará e aprovará (ou solicitará correções)
### 9.4 Versionamento
```
Versão 1.0.0 → Publicação inicial
Versão 1.1.0 → Novos robots adicionados
Versão 1.2.0 → Correções de bugs
Versão 2.0.0 → Mudanças breaking
```
> ⚠️ Após cada atualização que mude a definição de robots (propriedades, nomes, etc.), os **usuários precisam reinstalar** o aplicativo para que as mudanças tenham efeito.
---
## 10. Evitando Erros e Bugs Comuns
### ❌ Erro 1: Usar endpoint OAuth em vez do `client_endpoint`
```typescript
// ❌ ERRADO — endpoint OAuth genérico
const url = `https://oauth.bitrix.info/rest/bizproc.robot.add`;
// ✅ CORRETO — endpoint do portal (vem no payload de instalação)
const url = `${auth.client_endpoint}bizproc.robot.add`;
```
### ❌ Erro 2: Esquecer o escopo `bizproc`
```
// Erro retornado:
{ "error": "insufficient_scope", "error_description": "..." }
// Solução: Adicionar escopo 'Business Processes' (bizproc) nas permissões do app
```
### ❌ Erro 3: Separar callback info com `|`
```typescript
// ❌ ERRADO — event_token pode conter | internamente
const callback = `${entityId}|${eventToken}|${endpoint}|${accessToken}`;
// ✅ CORRETO — usar separador seguro
const callback = `${entityId}:::${eventToken}:::${endpoint}:::${accessToken}`;
```
### ❌ Erro 4: Não tratar expiração de tokens
```typescript
// ❌ ERRADO — usar token que pode estar expirado
const response = await fetch(`${endpoint}bizproc.event.send`, {
  body: JSON.stringify({ auth: storedAccessToken, ... })
});
// ✅ CORRETO — verificar e renovar antes de usar
const token = await getValidToken(accountId);
const response = await fetch(`${endpoint}bizproc.event.send`, {
  body: JSON.stringify({ auth: token, ... })
});
```
### ❌ Erro 5: Robots duplicados ao reinstalar
```typescript
// ❌ ERRADO — apenas adicionar, sem verificar existência
await fetch(`${endpoint}bizproc.robot.add`, { ... });
// ✅ CORRETO — deletar antes de registrar novamente
await fetch(`${endpoint}bizproc.robot.delete`, {
  body: JSON.stringify({ auth: accessToken, CODE: robotCode })
});
await fetch(`${endpoint}bizproc.robot.add`, { ... });
```
### ❌ Erro 6: Propriedades divergentes entre instalação e toggle
```typescript
// ❌ ERRADO — definições diferentes no install vs toggle
// install.ts: { delay_value: { Type: "int" } }
// toggle.ts:  { delay:       { Type: "string" } }
// ✅ CORRETO — usar definição centralizada
import { ROBOT_DEFINITIONS } from "./shared/robot-definitions";
```
### ❌ Erro 7: Background Worker sem `errorHandlerUrl`
```typescript
// ❌ ERRADO — registro silenciosamente falha
await fetch(`${endpoint}placement.bind`, {
  body: JSON.stringify({
    auth: accessToken,
    PLACEMENT: "PAGE_BACKGROUND_WORKER",
    HANDLER: handlerUrl,
  })
});
// ✅ CORRETO — incluir errorHandlerUrl
await fetch(`${endpoint}placement.bind`, {
  body: JSON.stringify({
    auth: accessToken,
    PLACEMENT: "PAGE_BACKGROUND_WORKER",
    HANDLER: handlerUrl,
    OPTIONS: { errorHandlerUrl: handlerUrl },
  })
});
```
### ❌ Erro 8: Não retornar `BX24.installFinish()` na instalação
```html
<!-- ❌ ERRADO — Bitrix fica em loop de instalação -->
<body><p>Instalado com sucesso!</p></body>
<!-- ✅ CORRETO — sinalizar fim da instalação -->
<body>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <script>BX24.init(() => BX24.installFinish());</script>
</body>
```
---
## 11. Manual de Boas Práticas
### 🏗️ Arquitetura
1. **Centralize definições de robots** em um único arquivo/módulo compartilhado
2. **Separe handlers por responsabilidade**: install, robot-handler, event-processor
3. **Use filas de processamento** em vez de processamento síncrono
4. **Implemente idempotência** — o mesmo evento pode chegar mais de uma vez
### 🔐 Segurança
1. **Nunca exponha** `client_secret` no frontend
2. **Valide** o `application_token` em requisições recebidas do Bitrix
3. **Use HTTPS** em todos os endpoints sem exceção
4. **Armazene tokens criptografados** no banco de dados
5. **Implemente RLS** (Row Level Security) para isolar dados entre portais
6. **Nunca confie** em dados do frontend — valide no backend
### 🔄 Tokens e OAuth
1. **Renove tokens proativamente** antes da expiração (não espere o erro)
2. **Armazene ambos** `access_token` e `refresh_token` a cada refresh
3. **Implemente retry** com backoff exponencial para falhas de refresh
4. **Use `member_id`** como identificador único do portal (não o domínio)
### 📊 Monitoramento
1. **Registre todos os eventos** em tabelas de log
2. **Monitore taxa de erros** por portal/robot
3. **Implemente alertas** para falhas repetitivas
4. **Mantenha métricas** de tempo de processamento
### 🧪 Testes
1. **Teste em portais diferentes** (pelo menos 3)
2. **Teste com tokens expirados** para validar refresh
3. **Teste reinstalação** do aplicativo
4. **Teste com workflows complexos** (múltiplos robots em sequência)
5. **Teste ativação/desativação** (toggle) de robots individuais
### 📋 Nomenclatura
```typescript
// Robots
CODE: "smart_pause"              // snake_case, descritivo
NAME: "Pausa Inteligente"        // Localizado, título case
// Propriedades
property_name: "delay_value"     // snake_case
Property.Name: "Tempo de espera" // Localizado, frase
// Endpoints
/api/bitrix-install              // kebab-case
/api/bitrix-robot-handler        // prefixo do domínio
```
### 🚀 Performance
1. **Limite lotes de processamento** (máximo 50 eventos por execução)
2. **Use índices** nas colunas `status`, `scheduled_at` e `portal_id`
3. **Implemente timeout** em chamadas para a API do Bitrix (30s máximo)
4. **Evite consultas N+1** — use JOINs ou batch queries
### 📦 Deploy
1. **Use CI/CD** para deploys automatizados
2. **Mantenha variáveis de ambiente** separadas por ambiente (dev/staging/prod)
3. **Faça rollback automático** em caso de falha no deploy
4. **Implemente health checks** nos endpoints
---
## 12. Troubleshooting
### Problema: Robot não aparece no workflow
| Causa | Solução |
|---|---|
| Escopo `bizproc` não configurado | Adicionar escopo nas permissões do app |
| Robot registrado no endpoint errado | Usar `client_endpoint` do payload |
| Erro silencioso no `bizproc.robot.add` | Verificar resposta da API e logar erros |
| App não reinstalado após mudanças | Reinstalar o aplicativo no portal |
### Problema: Robot executa mas workflow não continua
| Causa | Solução |
|---|---|
| `bizproc.event.send` não foi chamado | Implementar resposta ao evento |
| Token expirado ao responder | Implementar refresh automático |
| `EVENT_TOKEN` incorreto | Verificar parsing do callback info |
| `USE_SUBSCRIPTION` não é "Y" | Configurar como "Y" no registro |
### Problema: Token refresh falhando
| Causa | Solução |
|---|---|
| `refresh_token` expirado (30 dias) | Usuário precisa reinstalar o app |
| `client_id`/`client_secret` incorretos | Verificar credenciais no app local |
| Rate limit na API OAuth | Implementar backoff exponencial |
### Problema: Background Worker não ativa
| Causa | Solução |
|---|---|
| `errorHandlerUrl` ausente | Adicionar no `OPTIONS` do `placement.bind` |
| Handler retorna JSON em vez de HTML | Servir HTML na rota raiz |
| Erro de CORS | Configurar headers `Access-Control-Allow-Origin` |
| Script do BX24 não carregado | Incluir `<script src="https://api.bitrix24.com/api/v1/">` |
### Logs úteis para debug
```sql
-- Verificar eventos agendados pendentes
SELECT id, entity_id, scheduled_at, status, retry_count
FROM scheduled_events
WHERE status = 'pending'
ORDER BY scheduled_at DESC
LIMIT 20;
-- Verificar falhas recentes
SELECT se.id, se.status, el.error_message, el.executed_at
FROM scheduled_events se
LEFT JOIN execution_logs el ON el.event_id = se.id
WHERE se.status = 'failed'
ORDER BY se.updated_at DESC
LIMIT 20;
-- Verificar tokens próximos de expirar
SELECT id, domain, expires_at,
  CASE WHEN expires_at < NOW() THEN 'EXPIRADO'
       WHEN expires_at < NOW() + INTERVAL '5 minutes' THEN 'EXPIRANDO'
       ELSE 'OK'
  END as token_status
FROM bitrix_accounts
ORDER BY expires_at;
```
---
## 13. Referências
| Recurso | URL |
|---|---|
| Documentação REST API | https://dev.1c-bitrix.ru/rest_help/ |
| Referência bizproc.robot.add | https://dev.1c-bitrix.ru/rest_help/bizproc/bizproc_robot/bizproc_robot_add.php |
| Referência bizproc.event.send | https://dev.1c-bitrix.ru/rest_help/bizproc/bizproc_event/bizproc_event_send.php |
| Referência placement.bind | https://dev.1c-bitrix.ru/rest_help/application_embedding/placement_bind.php |
| Guia OAuth Bitrix24 | https://dev.1c-bitrix.ru/rest_help/oauth/authentication.php |
| Portal Vendors | https://vendors.bitrix24.com |
| Marketplace Bitrix24 | https://www.bitrix24.com.br/apps/ |
---
## Apêndice: Esquema de banco de dados recomendado
```sql
-- Contas Bitrix24 (portais conectados)
CREATE TABLE bitrix_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  member_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Regras de automação
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bitrix_account_id UUID REFERENCES bitrix_accounts(id),
  name TEXT NOT NULL,
  robot_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Eventos agendados
CREATE TABLE scheduled_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES automation_rules(id),
  entity_id TEXT NOT NULL,           -- Callback info serializado
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Índices para performance
CREATE INDEX idx_events_status_scheduled
  ON scheduled_events(status, scheduled_at)
  WHERE status = 'pending';
-- Logs de execução
CREATE TABLE execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES scheduled_events(id),
  status TEXT NOT NULL,
  error_message TEXT,
  response_data JSONB,
  executed_at TIMESTAMPTZ DEFAULT now()
);
```
---
> **Última atualização**: Fevereiro 2026
> **Versão do guia**: 1.0.0