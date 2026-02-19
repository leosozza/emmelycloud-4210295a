

# Plano: Ativar Chatbot como IM Bot Nativo no Bitrix24

## Contexto Atual

O sistema ja tem:
- `chatbot-reply` edge function (busca agente, gera resposta IA, salva mensagem)
- `bitrix24-events` com handler ONIMBOTMESSAGEADD
- `bitrix24-install` que regista o bot "Emmely AI" com `OPENLINE=Y`
- Dashboard Bitrix24 com aba Agentes (CRUD completo)

## Problemas a Resolver

1. **Nenhum agente existe na base** -- a tabela `ai_agents` esta vazia, o chatbot sempre retorna "no_active_agent"
2. **ONIMBOTMESSAGEADD nao responde no Bitrix24** -- atualmente so procura conversas externas e chama `chatbot-reply`, mas nunca envia resposta de volta ao chat do Bitrix24 via `im.message.add`
3. **chatbot-reply so funciona com conversas externas** -- nao suporta o cenario de responder diretamente no chat do Bitrix24 sem conversa externa

## Alteracoes

### 1. `bitrix24-events/index.ts` -- Responder diretamente no Bitrix24

O handler ONIMBOTMESSAGEADD precisa de:
- Receber a mensagem do utilizador no chat do Bitrix24
- Chamar `ai-playground` diretamente (em vez de `chatbot-reply`) para gerar resposta
- Enviar resposta de volta ao chat do Bitrix24 via `im.message.add` usando o BOT_ID
- Se existir conversa externa associada, tambem encaminhar via `message-send`

Fluxo corrigido:
```text
ONIMBOTMESSAGEADD recebido
  -> Extrair messageText, chatId, dialogId
  -> Buscar agente default (is_default=true, is_active=true)
  -> Se nao ha agente: ignorar
  -> Chamar ai-playground com agente + mensagem
  -> Enviar resposta via im.message.add (DIALOG_ID, MESSAGE)
  -> (Opcional) Se ha conversa externa: forward via message-send
```

### 2. `chatbot-reply/index.ts` -- Manter para canais externos

Continua a ser usado quando mensagens chegam de canais externos (Instagram/WhatsApp webhooks). Nenhuma alteracao necessaria -- ja funciona corretamente para esse cenario.

### 3. Agente Default Automatico

Adicionar logica ao `bitrix24-install` para criar um agente default se nao existir nenhum, garantindo que o chatbot funciona imediatamente apos a instalacao.

---

## Detalhes Tecnicos

### Alteracao 1: `bitrix24-events/index.ts`

No bloco ONIMBOTMESSAGEADD (linhas 270-314), substituir a logica atual por:

```text
1. Extrair DIALOG_ID (para responder no chat correto)
2. Buscar agente default da tabela ai_agents
3. Chamar ai-playground com agent_id + [{ role: "user", content: messageText }]
4. Obter token valido via ensureValidToken
5. Chamar im.message.add:
   - DIALOG_ID: dialogId do evento
   - MESSAGE: resposta da IA
```

### Alteracao 2: `bitrix24-install/index.ts`

Apos registar o bot, verificar se existe algum agente na tabela. Se nao:
- Inserir agente default "Emmely AI" com:
  - `is_default: true`
  - `is_active: true`
  - `ai_provider: "lovable"`
  - `ai_model: "google/gemini-3-flash-preview"`
  - `system_prompt`: prompt basico de assistente

### Alteracao 3: Deploy

Fazer deploy das edge functions atualizadas:
- `bitrix24-events`
- `bitrix24-install`

---

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `supabase/functions/bitrix24-events/index.ts` | Reescrever handler ONIMBOTMESSAGEADD para responder via im.message.add |
| `supabase/functions/bitrix24-install/index.ts` | Criar agente default se tabela vazia |

## Resultado Esperado

Apos instalar a app no Bitrix24:
1. Bot "Emmely AI" aparece no Contact Center > Chatbot
2. Agente default e criado automaticamente
3. Quando alguem envia mensagem ao bot no Bitrix24, ele responde diretamente no chat usando IA
4. Funciona independente de ter WhatsApp/Instagram conectados

