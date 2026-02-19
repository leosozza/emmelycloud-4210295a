
# Plano: Remover Callbell e Reestruturar Integracao Direta + Chatbot Bitrix24

## Resumo

Remover completamente o Callbell como intermediario. O WhatsApp e Instagram passam a ser integracoes diretas (Meta Graph API / WhatsApp Business API). O chatbot funciona como IM Bot nativo no Bitrix24, independente de ter instancias de canal conectadas.

---

## Parte 1: Ficheiros a Eliminar

Estas edge functions e testes serao completamente removidos:

| Ficheiro | Razao |
|----------|-------|
| `supabase/functions/callbell-send/` | Substituido por envio direto |
| `supabase/functions/callbell-status/` | Sem equivalente necessario |
| `supabase/functions/callbell-webhook/` | Substituido por `instagram-webhook` e novo `whatsapp-webhook` |
| `supabase/functions/_tests/callbell-send.test.ts` | Testes do Callbell |
| `supabase/functions/_tests/callbell-status.test.ts` | Testes do Callbell |
| `supabase/functions/_tests/callbell-webhook.test.ts` | Testes do Callbell |
| `src/lib/messagingProvider.ts` | Conceito callbell/direct ja nao faz sentido |

---

## Parte 2: Reestruturar Envio de Mensagens

### 2.1 Novo `message-send` (edge function unificada)

Substitui `callbell-send`. Logica:

```text
Recebe: conversation_id, content
-> Busca conversa (canal, contacto)
-> Se instagram: envia via Meta Graph API (reutiliza logica do instagram-send actual)
-> Se whatsapp: envia via WhatsApp Business API (Meta Cloud API)
-> Se email/webchat: salva directo na DB
-> Salva mensagem outbound
-> Atualiza conversa
```

### 2.2 Novo `whatsapp-webhook` (edge function)

Recebe webhooks directos do WhatsApp Business API (Meta Cloud API):
- Verifica assinatura do webhook
- Processa mensagens inbound
- Cria/atualiza conversas
- Dispara `chatbot-reply` (fire and forget)
- Forward ao Bitrix24 via `bitrix24-send`

### 2.3 Atualizar `instagram-webhook`

Actualmente so faz acknowledge (200 OK) porque dependia do Callbell. Agora passa a processar mensagens inbound directamente:
- Parse do payload Meta webhook
- Criar/atualizar conversas
- Salvar mensagens
- Disparar `chatbot-reply`
- Forward ao Bitrix24

---

## Parte 3: Chatbot como IM Bot Nativo no Bitrix24

O chatbot ja esta parcialmente implementado. Mudancas necessarias:

### 3.1 `chatbot-reply/index.ts`
- Remover todo o bloco de envio via Callbell (linhas 120-144)
- Quando o chatbot gera resposta, enviar via:
  - `message-send` (para o canal do cliente -- Instagram/WhatsApp directo)
  - `bitrix24-send` (para o operador no Bitrix24 ver a resposta do bot)
- O bot IM no Bitrix24 ja esta registado como `emmely_ai_bot` com `OPENLINE=Y`

### 3.2 `bitrix24-events/index.ts`
- Remover toda a logica de envio via Callbell API (linhas 199-260)
- Quando operador responde no Bitrix24 (`OnImConnectorMessageAdd`):
  - Encontrar a conversa correspondente
  - Enviar via `message-send` (que roteia para Instagram/WhatsApp directamente)
  - Salvar mensagem outbound na DB

### 3.3 Fluxo do Chatbot (independente de canais)

```text
Mensagem no Bitrix24 (ONIMBOTMESSAGEADD)
  -> bitrix24-events detecta
  -> Chama chatbot-reply com contexto
  -> chatbot-reply gera resposta via IA
  -> Responde no Bitrix24 via imbot (im.message.add)
  -> Se ha conversa com canal externo: envia via message-send
```

O chatbot funciona mesmo sem Instagram/WhatsApp conectados -- responde directamente no chat do Bitrix24 como bot IM.

---

## Parte 4: Frontend - Remover Referencias Callbell

### 4.1 `src/pages/Atendimento.tsx`
- Remover import de `messagingProvider`
- Envio de mensagens passa a chamar `message-send` para todos os canais
- Remover poll de status via `callbell-status`

### 4.2 `src/pages/Integracoes.tsx`
- Remover opcao "Callbell API" dos selects de provider
- Remover campos de credenciais Callbell (`CALLBELL_API_TOKEN`, `CALLBELL_IG_CHANNEL_UUID`, `CALLBELL_WA_CHANNEL_UUID`)
- WhatsApp mostra campos: `META_WA_PHONE_NUMBER_ID`, `META_WA_ACCESS_TOKEN`, `META_WA_VERIFY_TOKEN`
- Instagram mantem campos Meta existentes

### 4.3 `src/pages/ApiDocs.tsx`
- Remover endpoints Callbell da documentacao
- Adicionar endpoints `message-send`, `whatsapp-webhook`

### 4.4 `src/pages/Roadmap.tsx`
- Substituir "Integracao Callbell" por "Integracao WhatsApp/Instagram Directa"

---

## Parte 5: config.toml

- Remover entradas `callbell-webhook`, `callbell-send`, `callbell-status`
- Adicionar `message-send`, `whatsapp-webhook`

---

## Ordem de Implementacao

1. Criar `message-send` edge function (envio unificado)
2. Criar `whatsapp-webhook` edge function
3. Atualizar `instagram-webhook` para processar mensagens inbound
4. Atualizar `chatbot-reply` (remover Callbell, usar message-send)
5. Atualizar `bitrix24-events` (remover Callbell, usar message-send)
6. Atualizar frontend (`Atendimento`, `Integracoes`, `ApiDocs`, `Roadmap`)
7. Eliminar ficheiros Callbell e `messagingProvider.ts`
8. Atualizar `config.toml`
9. Deploy de todas as edge functions

---

## Segredos Necessarios

Ja existentes e suficientes para Instagram:
- `META_PAGE_ACCESS_TOKEN`
- `META_IG_ACCOUNT_ID`
- `META_APP_SECRET`

Para WhatsApp Business API (novos, a solicitar ao utilizador):
- `META_WA_PHONE_NUMBER_ID` -- ID do numero de telefone no Meta Business
- `META_WA_ACCESS_TOKEN` -- Token de acesso permanente do WhatsApp Business

Segredos Callbell a manter temporariamente (nao sao eliminados automaticamente):
- `CALLBELL_API_TOKEN`, `CALLBELL_IG_CHANNEL_UUID`, `CALLBELL_WA_CHANNEL_UUID` ficam sem uso
