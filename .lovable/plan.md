

# Badges Configuráveis no Bitrix24 CRM — Diferencial Emmely AI

## Visão Geral

Integrar o sistema de **Configurable Activities + Badges** do Bitrix24 para que todas as ações da Emmely AI (chatbot respondeu, mensagem enviada, mensagem entregue, erro de envio, pagamento criado, etc.) apareçam como **badges visuais no Kanban do CRM** e **atividades configuráveis na timeline**, em vez de simples mensagens na timeline.

Isto cria um diferencial competitivo significativo: o utilizador vê, diretamente no Kanban e na timeline do Lead/Negócio, badges coloridos com o estado de cada interação.

## Arquitetura

### 1. Registar Badge Types na Instalação (`bitrix24-install`)

Durante a instalação da app, registar os tipos de badges personalizados via `crm.activity.badge.add`:

| Badge Code | Title | Type (Cor) | Quando |
|---|---|---|---|
| `emmely_bot_replied` | Emmely AI | success (verde) | Bot respondeu com sucesso |
| `emmely_msg_sent` | Mensagem Enviada | primary (azul) | Mensagem enviada ao canal |
| `emmely_msg_delivered` | Entregue | success (verde) | Confirmação de entrega |
| `emmely_msg_failed` | Erro de Envio | failure (vermelho) | Falha no envio |
| `emmely_human_takeover` | Atendimento Humano | warning (amarelo) | Transferido para humano |
| `emmely_payment_created` | Cobrança Criada | primary (azul) | Pagamento criado |
| `emmely_payment_confirmed` | Pagamento Confirmado | success (verde) | Pagamento recebido |

### 2. Criar Configurable Activities nos Eventos-Chave

Em vez de simplesmente enviar mensagens na timeline, criar **atividades configuráveis** via `crm.activity.configurable.add` com layout rico:

- **Header**: Titulo da ação (ex: "Emmely AI respondeu")
- **Body**: Blocos com detalhes (mensagem, canal, instância usada)
- **Footer**: Botões de ação (ex: "Abrir Conversa", "Ver Detalhes")
- **badgeCode**: Referencia ao badge registado, que aparece no Kanban

### 3. Pontos de Integração (Edge Functions a Modificar)

#### a) `chatbot-reply/index.ts`
Após o bot responder com sucesso, chamar o Bitrix24 para criar uma atividade configurável com badge `emmely_bot_replied` no Lead/Negócio associado à conversa.

#### b) `message-send/index.ts`
Após envio bem-sucedido ou falhado ao WhatsApp/Instagram, criar atividade com badge `emmely_msg_sent` ou `emmely_msg_failed`.

#### c) `bitrix24-worker/index.ts`
No handler de bot messages e connector messages, após processar, criar atividade configurável com o badge apropriado.

#### d) `bitrix24-return-to-bot/index.ts`
Quando o atendimento volta ao bot, criar atividade com badge `emmely_human_takeover` (ou inverso).

### 4. Nova Função Utilitária: `createBitrixActivity`

Criar uma função helper reutilizável dentro do `bitrix24-worker` (ou como módulo partilhado) que encapsula a lógica de:

1. Encontrar a integração Bitrix24 ativa
2. Garantir token válido
3. Encontrar o `ownerTypeId` e `ownerId` (Lead=1, Deal=2, Contact=3) a partir da conversa (via `bot_state.bitrix_entity_id` ou pesquisa por telefone)
4. Chamar `crm.activity.configurable.add` com o layout e badge corretos
5. Log no `bitrix24_debug_logs`

```text
+------------------+     +-------------------+     +------------------+
| chatbot-reply    |---->|                   |---->| Bitrix24 API     |
| message-send     |---->| createBitrixBadge |---->| configurable.add |
| bitrix24-worker  |---->|   (helper)        |---->| + badge          |
| return-to-bot    |---->|                   |     +------------------+
+------------------+     +-------------------+
```

### 5. Exemplo de Layout de Atividade

```text
Layout para "Bot Respondeu":

  icon: { code: "chat" }
  header: { title: "Emmely AI respondeu" }
  body:
    logo: { code: "robot" }
    blocks:
      channel: { type: "text", value: "WhatsApp" }
      message: { type: "largeText", value: "Olá! Como posso..." }
      instance: { type: "text", value: "WhatsApp Principal" }
  footer:
    buttons:
      openConversation:
        title: "Ver Conversa"
        action: { type: "openRestApp", actionParams: { conversationId } }
  
  badgeCode: "emmely_bot_replied"
```

## Detalhes Técnicos

### Ficheiros a Criar/Modificar

| Ficheiro | Ação |
|----------|------|
| `supabase/functions/bitrix24-install/index.ts` | Registar badges via `crm.activity.badge.add` durante a instalação |
| `supabase/functions/bitrix24-worker/index.ts` | Adicionar helper `createBitrixActivity()` e chamar após processar eventos de bot/connector |
| `supabase/functions/chatbot-reply/index.ts` | Após resposta do bot, criar atividade configurável com badge no CRM |
| `supabase/functions/message-send/index.ts` | Após envio (sucesso/falha), criar atividade com badge correspondente |
| `supabase/functions/bitrix24-send/index.ts` | Integrar criação de badge quando mensagens são encaminhadas ao Bitrix24 |

### Fluxo de Resolução do Entity (Lead/Deal)

Para vincular a atividade ao Lead/Negócio correto:

1. Verificar `conversation.bot_state.bitrix_entity_id` (vinculação direta)
2. Se não existir, pesquisar Lead por telefone via `crm.lead.list` com `PHONE`
3. Se não existir, pesquisar Contacto via `crm.contact.list`
4. Guardar o `entity_id` encontrado no `bot_state` para futuras pesquisas

### Considerações

- As atividades configuráveis só podem ser criadas no contexto da app (precisam do access_token da app, não webhook)
- Os badges aparecem no Kanban enquanto a atividade estiver aberta (`completed: false`)
- Quando a conversa é resolvida, atualizar a atividade para `completed: true` (badge desaparece do Kanban)
- Fire-and-forget pattern: a criação do badge não deve bloquear o fluxo principal (chatbot-reply, message-send)

