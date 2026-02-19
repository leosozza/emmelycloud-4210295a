
# Plano: Replicar a Logica do Thothai para o Conector Bitrix24

## Problema Identificado

Apos analise detalhada do codigo do thothai (referencia funcional) vs. o codigo atual do Emmely Cloud, foram encontrados 3 problemas criticos:

1. **O conector nunca e ativado**: O `bitrix24-connector-settings` nao chama `imconnector.activate` quando o Bitrix24 abre o slider de configuracao. No thothai, o `connector-settings` detecta o `PLACEMENT_OPTIONS` com `LINE` e `ACTIVE_STATUS`, e executa `imconnector.activate` + `imconnector.connector.data.set` para activar o conector na Open Line. Sem isso, o conector aparece como "registado" mas nunca fica "ativo" no Contact Center.

2. **Eventos processados de forma sincrona**: O `bitrix24-events` atual processa tudo inline (busca agente, chama IA, responde), o que pode causar timeouts no Bitrix24 (limite < 200ms). No thothai, o `events` apenas faz ACK rapido (`return "successfully"`) e enfileira na tabela `bitrix_event_queue`, delegando o processamento ao `bitrix24-worker`.

3. **Nao existe `bitrix24-worker`**: A funcao que processa a fila de eventos assincronamente nao existe. E ela que no thothai lida com mensagens do operador, bot messages, connector status changes, etc.

## Solucao

### Fase A: Corrigir `bitrix24-connector-settings` (Activacao do Conector)

Reescrever a funcao para seguir a logica do thothai:
- Parsear `PLACEMENT_OPTIONS` (contem `LINE`, `ACTIVE_STATUS`, `CONNECTOR`)
- Quando `SETTING_CONNECTOR` placement ou `ACTIVE_STATUS === 1`:
  - Chamar `imconnector.activate` com `CONNECTOR`, `LINE`, `ACTIVE: 1`
  - Chamar `imconnector.connector.data.set` para definir o URL do handler
  - Verificar activacao via `imopenlines.config.list.get`
  - Atualizar `connector_active` na tabela `bitrix24_integrations`
- Se ja estiver totalmente configurado, retornar `"successfully"` (texto plano - o Bitrix24 exige isto)

### Fase B: Converter `bitrix24-events` para ACK Rapido + Fila

Reescrever para seguir o padrao do thothai:
- Parsear payload (suporte a PHP-style form data com arrays aninhados)
- Identificar tipo de evento
- Inserir na tabela `bitrix_event_queue` com status "pending"
- Disparar `bitrix24-worker` via fire-and-forget (usando `EdgeRuntime.waitUntil`)
- Retornar `"successfully"` em menos de 200ms
- Eventos suportados: `ONIMCONNECTORMESSAGEADD`, `ONIMBOTMESSAGEADD`, `ONIMBOTJOINOPEN`, `ONIMBOTWELCOMEMESSAGE`, `ONIMCONNECTORSTATUSDELETE`, `PLACEMENT`

### Fase C: Criar `bitrix24-worker` (Processamento Assincrono)

Nova edge function que:
- Busca eventos pendentes da `bitrix_event_queue`
- Processa cada evento conforme o tipo:
  - **ONIMCONNECTORMESSAGEADD**: Operador envia mensagem -> encaminhar para WhatsApp/Instagram via `message-send`
  - **ONIMBOTMESSAGEADD**: Mensagem recebida pelo bot IM -> chamar `ai-process-message` -> responder via `im.message.add`
  - **ONIMBOTWELCOMEMESSAGE / ONIMBOTJOINOPEN**: Enviar mensagem de boas-vindas do agente
  - **ONIMCONNECTORSTATUSDELETE**: Desactivar canal
- Retry com max 3 tentativas
- Atualiza status para "done" ou "failed"
- Limpeza de BBCode para WhatsApp

### Fase D: Atualizar Configuracao

- Adicionar `bitrix24-worker` ao `config.toml` com `verify_jwt = false`
- Fazer deploy de todas as 3 funcoes

## Detalhes Tecnicos

### Tabela `bitrix_event_queue` (ja existe)

Campos utilizados: `id`, `event_type`, `payload`, `status` (pending/processing/done/failed), `attempts`, `max_attempts`, `last_error`, `processed_at`

### Fluxo Completo Apos Implementacao

```text
Bitrix24 Contact Center
        |
        v
[bitrix24-connector-settings]
  - PLACEMENT_OPTIONS.LINE = N
  - imconnector.activate(CONNECTOR, LINE, ACTIVE=1)
  - imconnector.connector.data.set(...)
  - return "successfully"
        |
        v
Conector Ativo no Contact Center (visivel ao utilizador)
        |
        v
Mensagem recebida pelo Bitrix24
        |
        v
[bitrix24-events]
  - Parse payload
  - INSERT bitrix_event_queue (status=pending)
  - Trigger bitrix24-worker (fire & forget)
  - return "successfully" (< 200ms)
        |
        v
[bitrix24-worker]
  - SELECT pending events
  - Process: ONIMBOTMESSAGEADD -> ai-process-message -> im.message.add
  - Process: ONIMCONNECTORMESSAGEADD -> message-send (WhatsApp/Instagram)
  - UPDATE status = done/failed
```

### Ficheiros a Criar/Editar

1. **`supabase/functions/bitrix24-connector-settings/index.ts`** - Reescrever com logica de activacao
2. **`supabase/functions/bitrix24-events/index.ts`** - Converter para ACK rapido + enfileiramento
3. **`supabase/functions/bitrix24-worker/index.ts`** - Criar nova funcao (processamento assincrono)
4. **`supabase/config.toml`** - Adicionar `bitrix24-worker`
