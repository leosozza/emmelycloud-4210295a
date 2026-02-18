# Guia de Troubleshooting Bitrix24 - Thoth.ai

> **Versão:** 2.9  
> **Última Atualização:** Janeiro 2025  
> **Autor:** Thoth.ai Engineering Team

Este documento consolida todos os aprendizados e soluções para problemas comuns na integração Bitrix24 ↔ WhatsApp, evitando que erros similares ocorram ao escalar para novas empresas.

---

## 📋 Índice

1. [Checklist Pré-Integração](#checklist-pré-integração)
2. [Problemas Comuns e Soluções](#problemas-comuns-e-soluções)
3. [Arquitetura do Fluxo de Mensagens](#arquitetura-do-fluxo-de-mensagens)
4. [Sistema de Auto-Reparo](#sistema-de-auto-reparo)
5. [Detecção de Mensagens do Bot](#detecção-de-mensagens-do-bot)
6. [Mapeamento de Canais](#mapeamento-de-canais)
7. [Logs e Diagnóstico](#logs-e-diagnóstico)
8. [Erros Conhecidos e Soluções](#erros-conhecidos-e-soluções)

---

## ✅ Checklist Pré-Integração

**CRÍTICO:** Antes de ativar qualquer nova empresa, verificar TODOS os itens:

### 1. Open Line (Canal Aberto)
- [ ] Portal possui ao menos **UMA Open Line ATIVA**
- [ ] A linha possui ao menos **UM operador na fila**
- [ ] O modo CRM está configurado (Lead ou Deal)
- [ ] `TIMEMAN` está desativado (evita bloqueio por horário)
- [ ] `CHECK_AVAILABLE` está desativado (evita bloqueio por disponibilidade)

### 2. Conector WhatsApp
- [ ] Conector `thoth_whatsapp` está **registrado** no portal
- [ ] Conector está **ATIVO** na Open Line correta
- [ ] Eventos do conector estão vinculados (não mostrar erro "already binded" como falha)

### 3. Instância WhatsApp
- [ ] Instância está **conectada** (status: "connected")
- [ ] Instância está **mapeada** para a Open Line correta (`bitrix_channel_mappings`)
- [ ] Webhook da Evolution API está configurado corretamente

### 4. Workspace
- [ ] Integração Bitrix24 está **ativa** no workspace
- [ ] Token de acesso está **válido** (não expirado)
- [ ] `workspace_id` está corretamente vinculado

---

## 🔴 Problemas Comuns e Soluções

### Problema 1: Mensagens não aparecem no Bitrix24

**Sintomas:**
- WhatsApp recebe mensagem
- Bitrix24 não mostra a conversa
- Logs mostram "No active channel mapping found"

**Causa Raiz:**
- Instância WhatsApp não está mapeada para nenhuma Open Line
- OU o mapeamento aponta para uma linha **inativa**

**Solução:**
```sql
-- Verificar mapeamentos existentes
SELECT bcm.*, i.name as instance_name, i.status 
FROM bitrix_channel_mappings bcm
JOIN instances i ON i.id = bcm.instance_id
WHERE bcm.workspace_id = 'WORKSPACE_ID';

-- Se não houver mapeamento, criar:
INSERT INTO bitrix_channel_mappings (instance_id, integration_id, line_id, workspace_id, is_active)
VALUES ('INSTANCE_ID', 'INTEGRATION_ID', LINE_ID_NUMERO, 'WORKSPACE_ID', true);
```

**Prevenção:**
- Sempre usar o botão "Configurações" (⚙️) na instância para vincular à Open Line
- O sistema agora faz auto-correção buscando linha ativa automaticamente

---

### Problema 2: Mensagens duplicadas no WhatsApp

**Sintomas:**
- Operador responde no Bitrix24
- Cliente recebe a mensagem 2x ou 3x
- Uma das mensagens tem prefixo do bot (ThothAI)

**Causa Raiz:**
- O bot da IA respondia automaticamente
- O Bitrix24 recebia a mensagem do bot como "nova mensagem"
- O sistema reenviava para o WhatsApp

**Solução (v2.9):**
O `bitrix24-worker` agora detecta mensagens do próprio bot e NÃO reenvia:

```typescript
// Padrões detectados como mensagens do bot:
const isBotMessage = messageText.includes("[b]ThothAI") || 
                     messageText.includes("ThothAI -") ||
                     messageText.startsWith("*ThothAI") ||
                     messageText.includes("Larissa Assitente") ||
                     messageText.includes("Larissa Assistente");

if (isBotMessage) {
  // Apenas envia confirmação de entrega, NÃO reenvia mensagem
  await sendDeliveryStatus(messageId);
  return;
}
```

**Prevenção:**
- Se adicionar novos prefixos de persona, incluir na lista de detecção
- Sempre testar fluxo bidirecional antes de liberar para produção

---

### Problema 3: Erro "Handler already binded"

**Sintomas:**
- Ao reconfigurar conector, aparece erro
- UI mostra como "falha" mesmo que esteja funcionando

**Causa Raiz:**
- O evento já estava vinculado anteriormente
- Não é um erro real, é uma confirmação

**Solução (v2.8):**
O sistema agora trata "already binded" como **SUCESSO**:

```typescript
// Verificar se é realmente erro ou sucesso
const isAlreadyBinded = errorMessage?.includes("already binded");
if (isAlreadyBinded) {
  // Tratar como sucesso, não como erro
  return { success: true, events_already_binded: true };
}
```

---

### Problema 4: Open Line sem operadores

**Sintomas:**
- Mensagens chegam mas não são roteadas
- Bitrix24 mostra "sem operadores disponíveis"
- Chat não aparece no Bate-papo

**Causa Raiz:**
- Fila de operadores está vazia
- Ou `CHECK_AVAILABLE: Y` bloqueia operadores "ocupados"

**Solução (Auto-Reparo):**
O sistema `autoRepairOpenLine` adiciona automaticamente até 10 funcionários:

```typescript
// Buscar funcionários ativos
const users = await callBitrix("user.get", { 
  FILTER: { ACTIVE: true }, 
  start: 0 
});

// Adicionar à fila
for (const user of users.slice(0, 10)) {
  await callBitrix("imopenlines.config.update", {
    CONFIG_ID: lineId,
    PARAMS: {
      QUEUE: [...existingQueue, user.ID]
    }
  });
}
```

---

### Problema 5: Modo CRM incorreto (Lead vs Deal)

**Sintomas:**
- Atividades/comentários não aparecem no CRM
- Erro ao tentar criar Lead em portal modo Simples

**Causa Raiz:**
- Portal está em modo "Simples" (só Deals, sem Leads)
- Sistema tentava criar Lead que não existe

**Solução:**
Detecção automática do modo CRM:

```typescript
const crmModeResult = await callBitrix("crm.settings.mode.get");
const isSimpleMode = crmModeResult.result === 2;

// Forçar entidade correta
const entityType = isSimpleMode ? "deal" : "lead";
```

---

## 🔄 Arquitetura do Fluxo de Mensagens

### WhatsApp → Bitrix24

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  WhatsApp   │────▶│ evolution-webhook │────▶│ ai-process-msg  │
│  (Cliente)  │     │                  │     │ (processa IA)   │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                                                      ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Bitrix24   │◀────│  bitrix24-send   │◀────│ ai-gateway      │
│  (CRM)      │     │  (envia p/ CRM)  │     │ (resposta IA)   │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

### Bitrix24 → WhatsApp

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Bitrix24   │────▶│ bitrix24-webhook │────▶│ bitrix24-worker │
│ (Operador)  │     │ (recebe evento)  │     │ (processa msg)  │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                           ┌──────────────────────────┘
                           │
                           ▼
┌─────────────┐     ┌──────────────────┐
│  WhatsApp   │◀────│ evolution-send   │
│  (Cliente)  │     │                  │
└─────────────┘     └──────────────────┘
```

### Ponto Crítico: Detecção de Loop

O `bitrix24-worker` DEVE detectar quando uma mensagem é do próprio bot para evitar:
1. Reenvio duplicado
2. Loop infinito de mensagens
3. Status incorreto no Bitrix24

---

## 🔧 Sistema de Auto-Reparo

### Funções de Auto-Reparo Implementadas

| Função | Localização | Descrição |
|--------|-------------|-----------|
| `autoRepairOpenLine` | bitrix24-send | Ativa linha, adiciona operadores, configura CRM |
| `findActiveLineWithConnector` | bitrix24-send | Busca linha ativa se mapeamento inválido |
| `repair_open_line` | bitrix24-webhook | Reparo agressivo via webhook |

### Configurações Forçadas

```typescript
const forcedConfig = {
  ACTIVE: "Y",           // Linha sempre ativa
  CRM_CREATE: "lead",    // Criar lead automático (ou "deal" em modo simples)
  CRM_TRANSFER: "Y",     // Transferir para CRM
  TIMEMAN: "N",          // Ignorar horário comercial
  CHECK_AVAILABLE: "N",  // Ignorar disponibilidade
  QUEUE_TYPE: "evenly"   // Distribuição uniforme
};
```

---

## 🤖 Detecção de Mensagens do Bot

### Padrões Reconhecidos (v2.9)

```typescript
const BOT_MESSAGE_PATTERNS = [
  "[b]ThothAI",           // Formato bold Bitrix
  "ThothAI -",            // Prefixo com hífen
  "*ThothAI",             // Formato markdown
  "Larissa Assitente",    // Nome da persona (typo intencional)
  "Larissa Assistente"    // Nome da persona correto
];
```

### Como Adicionar Novos Padrões

Se uma nova persona for criada, adicionar o padrão em:
- `supabase/functions/bitrix24-worker/index.ts` (linha ~360)

```typescript
// Exemplo: Adicionar nova persona "Carlos Vendas"
const isBotMessage = messageText.includes("[b]ThothAI") || 
                     messageText.includes("Carlos Vendas") ||  // NOVO
                     // ... outros padrões
```

---

## 🗺️ Mapeamento de Canais

### Tabela: bitrix_channel_mappings

```sql
CREATE TABLE bitrix_channel_mappings (
  id UUID PRIMARY KEY,
  instance_id UUID REFERENCES instances(id),
  integration_id UUID REFERENCES integrations(id),
  line_id INTEGER NOT NULL,        -- ID numérico da Open Line
  line_name TEXT,                  -- Nome para referência
  workspace_id UUID NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Regras de Mapeamento

1. **Uma instância = Uma linha:** Cada instância WhatsApp deve estar vinculada a apenas UMA Open Line
2. **Validação ativa:** O sistema valida se a linha está ativa antes de usar
3. **Auto-correção:** Se linha inativa, busca automaticamente outra linha ativa

### Verificação Manual

```sql
-- Ver todos os mapeamentos de um workspace
SELECT 
  bcm.id,
  i.name as instancia,
  i.phone_number,
  i.status as status_whatsapp,
  bcm.line_id,
  bcm.line_name,
  bcm.is_active
FROM bitrix_channel_mappings bcm
JOIN instances i ON i.id = bcm.instance_id
WHERE bcm.workspace_id = 'SEU_WORKSPACE_ID';
```

---

## 📊 Logs e Diagnóstico

### Onde Verificar Logs

| Função | O que verificar |
|--------|-----------------|
| `evolution-webhook` | Mensagens recebidas do WhatsApp |
| `ai-process-message` | Processamento da IA |
| `bitrix24-send` | Envio para Bitrix24, auto-reparo |
| `bitrix24-webhook` | Eventos recebidos do Bitrix24 |
| `bitrix24-worker` | Processamento de respostas do operador |
| `evolution-send-message` | Envio final para WhatsApp |

### Indicadores de Sucesso nos Logs

```
✅ "Message sent to Bitrix24 successfully"
✅ "v2.9 SKIPPING BOT SELF-MESSAGE"
✅ "Operator message sent successfully"
✅ "Auto-repair completed successfully"
```

### Indicadores de Problema

```
❌ "No active channel mapping found"
❌ "Open Line not active"
❌ "No operators in queue"
❌ "Token refresh failed"
```

### Tabela: bitrix_debug_logs

Para diagnóstico avançado, todos os eventos são logados:

```sql
SELECT * FROM bitrix_debug_logs 
WHERE workspace_id = 'WORKSPACE_ID'
ORDER BY timestamp DESC 
LIMIT 50;
```

---

## ⚠️ Erros Conhecidos e Soluções

### Erro 1: "CHAT_ID not found"

**Causa:** Sessão de chat não foi iniciada corretamente
**Solução:** O sistema usa fallback via `imopenlines.config.path.get`

### Erro 2: "Access token expired"

**Causa:** Token OAuth expirou
**Solução:** Sistema faz refresh automático via `refreshBitrixToken`

### Erro 3: "Connector not registered"

**Causa:** Conector foi desinstalado do portal
**Solução:** Usar botão "Reconfigurar" na UI

### Erro 4: "Entity not found" ao criar atividade

**Causa:** Tentando criar atividade em Lead quando portal é modo Simples
**Solução:** Sistema detecta modo CRM automaticamente

---

## 🚀 Processo de Onboarding de Nova Empresa

### Passo 1: Verificação Inicial
```bash
1. Acessar Bitrix24 da empresa
2. Ir em Contact Center → Open Lines
3. Verificar se existe ao menos 1 linha ativa
4. Verificar se há operadores na fila
```

### Passo 2: Instalação do App
```bash
1. Instalar app Thoth.ai do Marketplace
2. Criar conta ou logar
3. Conectar instância WhatsApp
4. Escanear QR Code
```

### Passo 3: Vinculação de Canal
```bash
1. Clicar em ⚙️ na instância conectada
2. Selecionar a Open Line desejada
3. Salvar configuração
4. Verificar se mapeamento foi criado
```

### Passo 4: Teste de Fluxo
```bash
1. Enviar mensagem de WhatsApp externo para o número
2. Verificar se aparece no Bitrix24
3. Responder pelo Bitrix24
4. Verificar se cliente recebeu
5. Verificar se não houve duplicação
```

### Passo 5: Validação Final
```bash
1. Verificar logs sem erros
2. Confirmar status "connected" da instância
3. Testar resposta do bot IA
4. Confirmar que bot não duplica mensagens
```

---

## 📝 Notas para Desenvolvedores

### Ao Modificar Fluxo de Mensagens

1. **SEMPRE** testar fluxo bidirecional
2. **SEMPRE** verificar se mensagens do bot são detectadas
3. **NUNCA** assumir que mapeamento existe - verificar primeiro
4. **SEMPRE** usar auto-reparo antes de falhar

### Ao Adicionar Nova Persona

1. Adicionar padrão de detecção em `bitrix24-worker`
2. Testar que mensagens não duplicam
3. Documentar o novo padrão neste guia

### Ao Debugar Problema de Cliente

1. Verificar `bitrix_channel_mappings` primeiro
2. Verificar status da instância
3. Verificar logs das funções na ordem do fluxo
4. Usar botão "Diagnosticar" na UI

---

## 📞 Suporte

Se após seguir este guia o problema persistir:

1. Coletar logs das últimas 24h
2. Exportar dados de `bitrix_debug_logs`
3. Capturar screenshot do mapeamento
4. Abrir ticket com todas as informações

---

*Este documento deve ser atualizado sempre que novos problemas forem identificados e resolvidos.*
