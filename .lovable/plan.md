## Objetivo

Mapear todos os pontos do app que tocam o Contact Center / Open Lines do Bitrix24, comparar com a especificação atual da REST API (`imconnector.*`, `imopenlines.*`, `placement.*`) e corrigir divergências que podem causar o conector "Emmely Messages" a não aparecer, aparecer sem ícone, recusar mensagens ou falhar ao ativar em novos portais.

## Pontos do código identificados

```text
Registro / instalação
  supabase/functions/bitrix24-install/index.ts        (linhas ~1010-1180)
  supabase/functions/bitrix24-rebind-events/index.ts
Tela de configuração (slider do Contact Center)
  supabase/functions/bitrix24-connector-settings/index.ts
Envio para o cliente final (Bitrix → externo)
  supabase/functions/bitrix24-worker/index.ts         (status.delivery, list, status)
  supabase/functions/bitrix24-send/index.ts           (send.messages, activate, chat.name.set)
Eventos vindos do Bitrix
  supabase/functions/bitrix24-events/index.ts         (OnImConnector*, OnImbot*)
Placements do operador (textarea / sidebar / menu / abas)
  supabase/functions/bitrix24-im-send-audio/index.ts
  supabase/functions/bitrix24-im-send-file/index.ts
  supabase/functions/bitrix24-im-context-menu/index.ts
  supabase/functions/bitrix24-im-sidebar/index.ts
  supabase/functions/bitrix24-crm-tab/index.ts
  supabase/functions/bitrix24-payment-tab/index.ts
  supabase/functions/bitrix24-booking-tab/index.ts
```

## Divergências encontradas vs. spec atual

1. **`imconnector.register` — formato de `ICON` desatualizado.** Hoje passamos objetos aninhados (`COLOR.BACKGROUND/BORDER`, `SIZE.WIDTH/HEIGHT`, `POSITION.TOP/LEFT`) e `DATA_IMAGE` em base64. A spec corrente pede `COLOR` como string `#hex`, `SIZE` como string (`"90%"`), `POSITION` como string (`"center"`) e `DATA_IMAGE` como SVG URL-encoded. Isso explica conector aparecendo sem ícone / com cor errada no Contact Center após a atualização.
2. **Flags novas não enviadas.** `DEL_EXTERNAL_MESSAGES`, `EDIT_INTERNAL_MESSAGES`, `DEL_INTERNAL_MESSAGES`, `NEWSLETTER`, `NEED_SYSTEM_MESSAGES`, `NEED_SIGNATURE`, `CHAT_GROUP` — definir explicitamente o comportamento (especialmente `NEWSLETTER=true` para o conector aparecer em campanhas CRM, e `CHAT_GROUP=false` para 1-a-1).
3. **`imconnector.connector.data.set` — payload `URL`/`URL_IM` apontando para `bitrix24-events`** (endpoint de eventos), o correto é deixar como página de gestão do canal externo. Reapontar para `FRONTEND_URL` ou para o handler de settings.
4. **`imopenlines.config.list.get`** — chamada com `params.select` que não é parâmetro suportado; pode estar voltando vazio em portais novos e bloqueando o auto-activate.
5. **Falta `placement.unbind`/re-registro do PLACEMENT_HANDLER do conector.** Após mudança do Contact Center, portais antigos podem ter handler "morto"; precisamos forçar re-`imconnector.register` no rebind para atualizar URL e ícone.
6. **Sem diagnóstico exposto.** Não há endpoint que liste, por integração, `imconnector.list` + `imconnector.status` por LINE, dificultando suporte.

## Mudanças a implementar

### 1. `bitrix24-install/index.ts`
- Reescrever o payload de `imconnector.register` no novo formato:
  ```ts
  ICON: { DATA_IMAGE: encodeURI('data:image/svg+xml,<svg…/>'), COLOR: '#2067b0', SIZE: '90%', POSITION: 'center' }
  ICON_DISABLED: { DATA_IMAGE: …, COLOR: '#99adb3' }
  ```
- Adicionar flags `DEL_EXTERNAL_MESSAGES: true`, `EDIT_INTERNAL_MESSAGES: true`, `DEL_INTERNAL_MESSAGES: true`, `NEWSLETTER: true`, `NEED_SYSTEM_MESSAGES: true`, `NEED_SIGNATURE: true`, `CHAT_GROUP: false`.
- Trocar `URL`/`URL_IM` do `connector.data.set` para `FRONTEND_URL` da app (ou para o `bitrix24-connector-settings`), não para o webhook de eventos.
- Remover `params.select` da chamada `imopenlines.config.list.get`.
- Logar resposta completa de `imconnector.register` em `bitrix24_debug_logs` para auditoria.

### 2. `bitrix24-rebind-events/index.ts`
- Forçar re-execução de `imconnector.register` com o novo payload (idempotente: erro `CONNECTOR_ALREADY_EXISTS` é OK, mas a chamada atualiza ícone/handler na maioria dos portais).
- Garantir `placement.unbind` dos handlers antigos do Contact Center antes do rebind.

### 3. `bitrix24-connector-settings/index.ts`
- Manter compat com novo POST do slider (Bitrix passa `PLACEMENT_OPTIONS` como `application/x-www-form-urlencoded` — já usamos esse parser no `bitrix24-im-send-audio`; reaproveitar).
- Após salvar, chamar `imconnector.connector.data.set` com `URL` correto (página de gestão da app) e revalidar com `imconnector.status`.

### 4. `bitrix24-send/index.ts`
- Antes de `imconnector.send.messages`, validar que `LINE` está ativa via `imconnector.status` (já existe) e que retornou `STATUS: true`; se não, ativar e re-tentar 1×.
- Garantir `user.id` como string (a spec exige string; hoje algumas chamadas mandam número).

### 5. `bitrix24-worker/index.ts`
- Endpoint diagnóstico novo (`?action=connector_audit`) que retorna, por integração:
  - `imconnector.list`
  - para cada LINE em `imopenlines.config.list.get`: `imconnector.status` do `CONNECTOR_ID`
  - mismatch entre `connector_active` no banco e `STATUS` real → loga e auto-corrige.

### 6. UI — `src/pages/Integracoes.tsx` (e/ou `Bitrix24App.tsx`)
- Card "Contact Center" com: status do conector por linha (ativo / inativo / não encontrado), botão "Reaplicar registro" (chama `bitrix24-rebind-events`) e "Auditar" (chama o novo endpoint do worker).

## Detalhes técnicos

- Após qualquer alteração em `bitrix24-install` ou `bitrix24-rebind-events`, gatilhar manualmente o rebind em cada portal já instalado para propagar o novo formato de ícone — incluir um botão dedicado na UI.
- Memory `mem://integracoes/bitrix24/sistema-badges-e-atividades-timeline` e relacionados não são afetados; nenhuma mudança em RLS, schema ou tabelas.
- Sem migrações de banco. Sem mudanças em `proposals` / `financial_records`.
- Não tocar em outros placements (CRM_DEAL, Emmely Pay, Agenda) — fora de escopo.

## Critérios de aceitação

1. Em portal de teste, depois do rebind, o conector "Emmely Messages" aparece no Contact Center com ícone correto e cor azul.
2. Ao ativá-lo em uma Open Line, `imconnector.status` retorna `STATUS: true` e o banco reflete `connector_active=true`.
3. Mensagem enviada do app chega no chat da Open Line; `imconnector.send.messages` retorna `SUCCESS:true`.
4. Endpoint de auditoria lista cada LINE com seu status real e marca divergências.
5. UI mostra estado verde/amarelo/vermelho por linha e permite reaplicar com 1 clique.
