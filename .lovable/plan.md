
# Analise Comparativa: Thothai vs Emmely Cloud

## Arquitetura do Thothai (Referencia Funcional)

### 1. Chatbot - Pipeline de Processamento de Mensagens

O Thothai segue uma arquitetura de 3 camadas que o nosso projeto nao tem:

```text
Webhook (meta-wa-webhook)
    |
    v
Flow Engine (flow-engine)     <-- CAMADA QUE FALTA
    |                              Decide: executar fluxo ou chamar IA
    |-- match por keyword
    |-- match por intent (IA)
    |-- match por smart routing
    |-- fallback: ai-process-message
    v
AI Processor (ai-process-message)
    |-- anti-loop (processing lock, duplicate hash)
    |-- knowledge retrieval (persona + workspace)
    |-- call ai-gateway (com fallback chain)
    |-- send response via provider factory
```

**No nosso projeto**, o webhook (`whatsapp-webhook`) chama diretamente o `chatbot-reply`, que chama o `ai-playground`. Nao existe:
- Flow Engine (matching de fluxos por keyword/intent/routing)
- Anti-loop protection (locks, duplicate detection)
- Provider factory (routing por tipo de instancia)
- bot_state management (variaveis, estado do fluxo na conversa)

### 2. Bitrix24 - Arquitetura de Eventos

O Thothai usa um sistema de **fila assincrona**:

```text
bitrix24-events (ACK rapido < 200ms)
    |-- enfileira em bitrix_event_queue
    |-- triggerWorker (fire-and-forget)
    v
bitrix24-worker (processamento assincrono)
    |-- ONIMCONNECTORMESSAGEADD: operador envia -> WhatsApp
    |-- ONIMBOTMESSAGEADD: mensagem para o bot -> IA responde
    |-- ONIMBOTJOINOPEN: welcome message
    |-- PLACEMENT: handler de UI
```

**No nosso projeto**, o `bitrix24-events` processa tudo sincronamente, sem fila. Risco de timeout no Bitrix24 (exige resposta < 3s).

### 3. Flow Engine - Logica Completa

O flow-engine do Thothai suporta 30+ tipos de nos:

| Tipo de No | Descricao | Temos? |
|---|---|---|
| message | Enviar mensagem texto | Sim (basico) |
| message_buttons | Botoes interativos WhatsApp | Nao |
| message_list | Lista interativa WhatsApp | Nao |
| input_capture | Capturar dados do usuario | Nao |
| condition / condition_button | Condicoes | Parcial |
| set_variable | Variaveis de fluxo | Nao |
| ai_response | Chamar IA dentro do fluxo | Nao |
| transfer_to_human | Transferir para humano | Nao |
| transfer_to_ai | Voltar para bot | Nao |
| delay | Atraso | Parcial |
| webhook_call | Chamar webhook externo | Nao |
| switch_persona | Trocar agente IA | Nao |
| bitrix_* (6 tipos) | Acoes CRM no Bitrix24 | Nao |
| message_media | Imagem/video/audio/doc | Nao |
| message_location | Enviar localizacao | Nao |
| message_contact | Enviar vCard | Nao |
| message_sticker | Enviar sticker | Nao |
| message_reaction | Reagir com emoji | Nao |
| message_cta_url | Botao CTA com URL | Nao |
| message_product | Produto do catalogo | Nao |
| message_carousel | Carousel de templates | Nao |
| whatsapp_flow | Formularios nativos WA | Nao |
| message_poll | Enquetes | Nao |
| bitrix_transfer_open_line | Transferir Open Line | Nao |

O motor de fluxos armazena estado em `bot_state` na conversa (waiting_for_button, waiting_for_input, flow_variables), permitindo pausar e retomar fluxos apos resposta do usuario.

### 4. WhatsApp Oficial (Meta Cloud API)

O Thothai tem funcoes separadas e mais robustas:

- **meta-wa-connect**: Valida token, gera verify_token, guarda credenciais por instancia
- **meta-wa-webhook**: Suporta TODOS os tipos de mensagem (text, image, audio, video, document, sticker, location, contacts, button, interactive, reaction, order, nfm_reply)
- **meta-wa-send-message**: Suporta 15+ tipos de envio (text, image, audio, video, document, template, template_media, carousel, product, product_list, location, location_request, contacts, sticker, reaction, cta_url, flow, interactive, list)

**No nosso projeto**:
- `whatsapp-webhook`: So processa `msg.type === "text"`
- `message-send`: So envia texto simples
- Credenciais via env vars globais (nao por instancia)

### 5. Treinamento (Knowledge Base)

O Thothai tem uma funcao `process-document` completa:
- Suporta: txt, csv, md, json, xml, html, **docx** (ZIP extraction), **xlsx**, **pptx**, PDF (via IA), URLs
- Chunking com overlap (1000 chars, 200 overlap)
- Limpeza de texto por IA (para URLs)
- Extracao de texto por IA (para PDFs e formatos legados)

**No nosso projeto**: O sistema de training existe na UI mas a funcao de processamento de documentos e basica.

### 6. AI Gateway (Multi-provider)

O Thothai tem um `ai-gateway` centralizado:
- Suporte a 7+ providers (Lovable, OpenRouter, DeepSeek, Anthropic, Moonshot, Groq, OpenAI)
- Fallback chain automatico (provider falha -> tenta OpenRouter -> tenta Lovable)
- Cache in-memory para persona/model lookups
- Retry com exponential backoff + jitter
- Timeout de 60s com AbortController
- Credenciais por workspace

**No nosso projeto**: O `ai-playground` chama diretamente o provider sem fallback, sem retry, sem cache.

---

## Plano de Implementacao (Priorizado)

### Fase 1: Flow Engine + Anti-loop (Critico)

1. **Criar `flow-engine/index.ts`** (~800 linhas)
   - Copiar a logica de matching: keyword -> intent -> all_messages -> default_flow
   - Copiar agent type routing: ai/flow/hybrid
   - Implementar execucao sequencial de nos com bot_state
   - Tipos de nos prioritarios: message, message_buttons, message_list, input_capture, condition, ai_response, transfer_to_human, delay, set_variable
   - Pausar/retomar fluxos (waiting_for_button, waiting_for_input)

2. **Melhorar `chatbot-reply` -> `ai-process-message`** (~400 linhas)
   - Adicionar processing lock (tryAcquireLock/releaseLock)
   - Duplicate detection (hash de resposta)
   - Knowledge retrieval: persona docs obrigatorios + workspace search complementar
   - Anti-repetition prompt
   - Verificacao final antes de enviar (human takeover check)

3. **Atualizar `whatsapp-webhook`**
   - Suportar todos os tipos de mensagem (nao so texto)
   - Chamar flow-engine em vez de chatbot-reply
   - Processar interactive responses (button_reply, list_reply)
   - Extrair button_response e force_flow_id do bot_state

### Fase 2: WhatsApp + Mensagens Avancadas

4. **Melhorar `message-send`** (~300 linhas)
   - Suportar todos os tipos do Meta Cloud API (buttons, list, template, media, location, etc.)
   - Logging de status de entrega

5. **Adicionar colunas a tabela conversations**
   - `bot_state jsonb DEFAULT '{}'`
   - `attendance_mode text DEFAULT 'bot'`
   - `processing_lock_at timestamptz`
   - `last_customer_message_at timestamptz`

### Fase 3: Bitrix24 Async + Document Processing

6. **Criar `bitrix24-worker`** (fila assincrona)
   - Tabela `bitrix_event_queue` (event_type, payload, status, attempts)
   - `bitrix24-events` enfileira + ACK rapido
   - Worker processa: ONIMCONNECTORMESSAGEADD, ONIMBOTMESSAGEADD, ONIMBOTJOINOPEN
   - Token refresh com OAuth

7. **Melhorar `process-document`** (se nao existir)
   - Suporte a docx/xlsx/pptx via JSZip
   - Extracao por IA para PDF
   - Chunking com overlap

### Fase 4: AI Gateway + Multi-provider

8. **Criar `ai-gateway`** centralizado
   - Fallback chain (provider -> OpenRouter -> Lovable)
   - Cache in-memory
   - Retry com backoff
   - Suporte a credenciais por workspace

---

## Tabelas/Colunas que Precisam de Ser Adicionadas

| Tabela | Coluna/Alteracao | Razao |
|---|---|---|
| conversations | `bot_state jsonb DEFAULT '{}'` | Estado do fluxo, variaveis, waiting flags |
| conversations | `attendance_mode text DEFAULT 'bot'` | Bot/human/ai mode |
| conversations | `processing_lock_at timestamptz` | Anti-loop lock |
| conversations | `last_customer_message_at timestamptz` | Fallback lock |

Tabela nova (opcional para Fase 3):
| bitrix_event_queue | id, event_type, payload, status, attempts, max_attempts, last_error, created_at, processed_at |

---

## Resumo das Diferencas Criticas

| Funcionalidade | Thothai | Emmely Cloud |
|---|---|---|
| Flow Engine | 30+ tipos de nos, bot_state | Nao existe |
| Anti-loop | 3 mecanismos (lock, hash, time) | Nenhum |
| WhatsApp tipos | 15+ tipos envio, todos inbound | So texto |
| Bitrix24 events | Fila assincrona + worker | Sincrono |
| AI fallback | 3-level chain + retry | Direto sem fallback |
| Knowledge | Persona docs + workspace search | Basico |
| Variaveis de fluxo | Suporte completo com template | Nao existe |
| Transferencia humano | Com bloqueio de bot | Nao existe |

A implementacao deve seguir a ordem das fases para maximizar impacto e minimizar risco.
