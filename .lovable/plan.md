
# Plano: Chatbot IA Funcional + Dashboard Completo no Bitrix24

## Resumo

Este plano aborda duas grandes areas:
1. **Motor de chatbot funcional** -- ligar o agente de IA ao fluxo de mensagens para que responda automaticamente no Contact Center do Bitrix24
2. **Dashboard completo no iframe** -- expandir o painel Bitrix24 para incluir gestao de Agentes, Flows, Training e Playground diretamente dentro do iframe

---

## Parte 1: Motor de Chatbot (Auto-Reply com IA)

### Problema Atual
Quando uma mensagem chega via Callbell webhook:
- E salva na tabela `messages`
- E reencaminhada ao Bitrix24 via `bitrix24-send`
- **MAS nao ha nenhuma chamada ao agente de IA para gerar resposta automatica**

### Solucao

**1.1 Modificar `callbell-webhook/index.ts`**
Apos salvar a mensagem inbound e antes do forward ao Bitrix24, adicionar logica de auto-reply:

```text
Fluxo:
  Mensagem inbound chega
  -> Salva na tabela messages
  -> Busca agente default (is_default=true, is_active=true)
  -> Se existe agente ativo:
     -> Busca ultimas N mensagens da conversa (contexto)
     -> Chama edge function ai-playground com agent_id + historico
     -> Recebe resposta do agente
     -> Salva mensagem outbound (direction=outbound, sender_name=AgenteName)
     -> Envia resposta via Callbell API (callbell-send)
     -> Envia resposta ao Bitrix24 (bitrix24-send) como mensagem do bot
  -> Forward original ao Bitrix24 (como ja faz)
```

Detalhes tecnicos:
- Buscar o agente default: `SELECT * FROM ai_agents WHERE is_default=true AND is_active=true LIMIT 1`
- Buscar historico: ultimas 10 mensagens da conversa para contexto
- Chamar `ai-playground` internamente (fetch para a propria edge function)
- Enviar resposta via Callbell usando `callbell-send`
- Enviar ao Bitrix24 com prefixo `[b]EmmelyAI[/b]` para que o `bitrix24-events` reconheca como mensagem de bot e nao crie loop

**1.2 Criar nova edge function `chatbot-reply/index.ts`** (alternativa mais limpa)
Em vez de sobrecarregar o webhook, criar uma funcao dedicada que:
- Recebe `conversation_id` e `message_text`
- Busca agente default ou agente especifico configurado para o canal
- Gera resposta via Lovable AI
- Envia para Callbell e Bitrix24
- Salva na base de dados

O `callbell-webhook` apenas faz um fire-and-forget para `chatbot-reply`.

**Decisao: Usar a abordagem 1.2** (funcao separada) -- mais modular e testavel.

**1.3 Registar chatbot como "bot" no Bitrix24**
O conector `emmely_connector` ja esta registado. Quando o agente responde, a mensagem aparece no Contact Center como mensagem do conector. O operador no Bitrix24 ve a conversa e pode intervir.

Para que no Contact Center > Chatbot o agente apareca:
- Registar via `imbot.register` durante o install um bot chamado "Emmely AI"
- Este bot fica disponivel na lista de chatbots do Contact Center
- O bot recebe mensagens via evento `ONIMBOTMESSAGEADD` e responde automaticamente

**1.4 Atualizar `bitrix24-install/index.ts`**
Adicionar registo do bot IM:
```
callBitrix(clientEndpoint, accessToken, "imbot.register", {
  CODE: "emmely_ai_bot",
  TYPE: "B",  // Bot type
  EVENT_MESSAGE_ADD: eventsUrl,
  PROPERTIES: {
    NAME: "Emmely AI",
    WORK_POSITION: "Assistente Virtual",
    COLOR: "#25D366",
    OPENLINE: "Y",  // Disponivel para Open Lines
  }
});
```

---

## Parte 2: Dashboard Bitrix24 Expandido

### Problema Atual
O `Bitrix24App.tsx` tem 4 abas, duas sao placeholders:
- Conector (funcional)
- Conversas (placeholder)
- Pagamentos (funcional)
- Automacoes (placeholder)

### Solucao

**2.1 Expandir as abas para:**

| Aba | Conteudo | Estado Atual |
|-----|----------|-------------|
| Conector | Status da integracao, canais, logs | Funcional |
| Agentes | CRUD de agentes IA, selecao de default | Novo |
| Training | Upload de documentos, URLs, texto | Novo |
| Flows | Lista e editor simplificado de fluxos | Novo |
| Playground | Chat de teste com agente selecionado | Novo |
| Pagamentos | Criar cobrancas, listar transacoes | Funcional |

**2.2 Implementacao tecnica**

Como o iframe do Bitrix24 nao pode usar Tailwind/Shadcn (sem CSS do projeto principal), todas as novas abas serao implementadas com **inline styles** (mesmo padrao do `Bitrix24App.tsx` atual).

Cada aba nova sera um componente funcional dentro do mesmo ficheiro (para simplicidade no iframe):

- **AgentesTab**: Lista agentes da tabela `ai_agents`, permite criar/editar nome, prompt, modelo. Botao para definir agente default.
- **TrainingTab**: Upload de texto/URL para criar `knowledge_documents`, listar documentos existentes, vincular a agentes.
- **FlowsTab**: Lista fluxos existentes, toggle ativo/inativo, criar fluxo basico (nome + trigger keyword). Editor visual completo fica na app principal.
- **PlaygroundTab**: Chat simples que envia mensagens ao `ai-playground` usando o agente selecionado e mostra respostas.

**2.3 Comunicacao com o backend**

Todas as chamadas usarao `fetch` direto para as edge functions (mesmo padrao do Bitrix24App atual):
- `GET/POST ${SUPABASE_URL}/functions/v1/ai-playground` -- para playground
- Criar nova edge function `bitrix24-admin/index.ts` que expoe CRUD simplificado para agentes, documentos e fluxos sem necessitar JWT (autenticado via member_id do Bitrix24)

---

## Parte 3: Ficheiros a Criar/Modificar

### Novos ficheiros:
1. `supabase/functions/chatbot-reply/index.ts` -- Motor de auto-reply
2. Expandir `src/pages/Bitrix24App.tsx` -- Adicionar 4 novas abas

### Ficheiros a modificar:
1. `supabase/functions/callbell-webhook/index.ts` -- Adicionar fire-and-forget para `chatbot-reply`
2. `supabase/functions/bitrix24-install/index.ts` -- Registar bot IM (`imbot.register`)
3. `supabase/functions/bitrix24-events/index.ts` -- Handler para `ONIMBOTMESSAGEADD` (mensagens direcionadas ao bot)
4. `supabase/config.toml` -- Adicionar `chatbot-reply`

### Resumo de alteracoes:

```text
callbell-webhook (modificar)
  +  Apos salvar mensagem, chamar chatbot-reply

chatbot-reply (novo)
  - Recebe conversation_id + message
  - Busca agente default
  - Busca historico da conversa
  - Chama ai-playground
  - Envia resposta via callbell-send
  - Envia resposta via bitrix24-send
  - Salva mensagem outbound

bitrix24-install (modificar)
  + Registar imbot "Emmely AI" com OPENLINE=Y

bitrix24-events (modificar)
  + Handler para ONIMBOTMESSAGEADD
  + Chamar chatbot-reply quando bot recebe mensagem

Bitrix24App.tsx (expandir)
  + Tab Agentes (CRUD inline)
  + Tab Training (upload texto/URL)
  + Tab Flows (lista + toggle)
  + Tab Playground (chat)
  - Remover placeholders
```

---

## Ordem de Implementacao

1. Criar `chatbot-reply` edge function
2. Modificar `callbell-webhook` para chamar chatbot-reply
3. Atualizar `bitrix24-install` com registo de bot
4. Atualizar `bitrix24-events` para bot messages
5. Expandir `Bitrix24App.tsx` com todas as novas abas
6. Atualizar `config.toml`
7. Deploy e teste
