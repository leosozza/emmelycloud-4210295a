

## Plano: Unificar Conversa + Consulta IA na aba CRM do Bitrix24

### Objectivo

Fundir as duas abas actuais (Conversa e Consultar IA) numa única vista com duas áreas integradas:
1. **Área superior**: Conversa com o cliente (mensagens, enviar mensagens, iniciar conversa com template)
2. **Área inferior**: Consulta IA com sistema de `@agente` para perguntas contextuais + botão "Usar resposta"

### Funcionalidades novas

**Conversa (área superior):**
- Quando não existe conversa, mostrar botões para iniciar (WhatsApp/Instagram) com opção de escolher **template de mensagem** (lista de `quick_replies` ou mensagem personalizada) em vez da mensagem fixa "Olá! Em que posso ajudar?"
- Quando existe conversa, permitir **enviar mensagem** directamente (textarea + botão enviar que chama `message-send`)
- Campo de digitação visível na conversa para resposta directa

**Consulta IA (área inferior, painel expansível):**
- Input com suporte a `@` — ao digitar `@`, aparece dropdown com lista de agentes (carregados via fetch a `ai_agents`)
- A pergunta é enviada ao agente seleccionado via `ai-playground` (com `agent_id`)
- O contexto da conversa actual é injectado automaticamente
- Cada resposta da IA tem botão **"Usar resposta"** que copia o texto para a barra de digitação da conversa (área superior), pronto para enviar

### Layout (vista única, sem abas)

```text
┌──────────────────────────────┐
│ Header: Nome + Badge + Canal │
├──────────────────────────────┤
│                              │
│   Mensagens da conversa      │
│   (scroll, max-height 50%)   │
│                              │
├──────────────────────────────┤
│ [textarea] [Enviar]          │  ← enviar ao cliente
├──────────────────────────────┤
│ ─── Emmely AI ─────────────  │
│ [Quick buttons] Resumir...   │
│ Respostas IA (com "Usar")   │
│ [@agente pergunta...] [Ask]  │
└──────────────────────────────┘
```

### Detalhes técnicos

**Edge function `bitrix24-crm-tab/index.ts`** — reescrita significativa:

1. **Remover sistema de abas** — tudo numa só vista com split vertical
2. **Carregar agentes**: No init do JS, fetch `SUPABASE_URL + /rest/v1/ai_agents?is_active=eq.true&select=id,name` com header `apikey`
3. **Sistema `@` mention**:
   - `oninput` no campo IA detecta `@` e mostra dropdown posicionado
   - Seleccionar agente define `selectedAgentId` e substitui `@texto` por `@NomeAgente `
   - O agente seleccionado é passado no payload para `ai-playground`
4. **Botão "Usar resposta"**: Cada resposta assistant tem link clicável que faz `document.getElementById('client-input').value = textoResposta`
5. **Iniciar conversa com template**: Buscar `quick_replies` via REST API e mostrar como opções ao iniciar conversa via WhatsApp Oficial (template), ou mensagem livre para API não-oficial
6. **Enviar mensagem**: Textarea + botão que chama `message-send` com `conversation_id` e `content`

### Ficheiro a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/bitrix24-crm-tab/index.ts` | Reescrita do HTML/JS — layout unificado, @agentes, usar resposta, enviar mensagem, templates |

