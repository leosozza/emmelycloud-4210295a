

## Sistema Anti-Loop para Integração Bitrix24

### Análise do Estado Atual
- A tabela `leads` já tem `sync_source` (text, default 'emmely') — adicionado na migração anterior
- A tabela `messages` **não** tem `sync_source`
- Deduplicação por `external_id` já existe parcialmente em `instagram-webhook` e `whatsapp-webhook`, mas não em `bitrix24-worker`
- **Não existem** funções `callbell-webhook` ou `callbell-send` — o projeto usa `whatsapp-webhook`, `wuzapi-webhook`, `instagram-webhook` (inbound) e `message-send`, `instagram-send`, `bitrix24-send` (outbound)

### Plano de Implementação

#### 1. Criar tabela `sync_dedup_cache`
```sql
CREATE TABLE public.sync_dedup_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,        -- 'message', 'lead', 'deal'
  entity_id text NOT NULL,          -- ID interno (Emmely)
  external_id text NOT NULL,        -- ID externo (Bitrix24/WhatsApp)
  source text NOT NULL,             -- 'emmely' ou 'bitrix24'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dedup_entity_external ON public.sync_dedup_cache(entity_type, external_id, source);
CREATE INDEX idx_dedup_created_at ON public.sync_dedup_cache(created_at);

ALTER TABLE public.sync_dedup_cache ENABLE ROW LEVEL SECURITY;

-- Service role only
CREATE POLICY "Service role full access sync_dedup_cache"
  ON public.sync_dedup_cache FOR ALL
  USING (true) WITH CHECK (true);
```

#### 2. Adicionar `sync_source` à tabela `messages`
```sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sync_source text;
```

#### 3. Edge function de limpeza TTL (cron-style cleanup)
Adicionar lógica de cleanup no `bitrix24-worker` — antes de processar eventos, limpar entradas com mais de 5 minutos:
```sql
DELETE FROM sync_dedup_cache WHERE created_at < now() - interval '5 minutes';
```

#### 4. Modificar `bitrix24-worker` — dedup no `handleConnectorMessage`
Antes de inserir/reencaminhar mensagem, verificar no `sync_dedup_cache`:
- Se `external_id` já existe com `source='emmely'` → é eco do envio → ignorar
- Ao processar mensagem inbound, registar no cache com `source='bitrix24'`

#### 5. Modificar `bitrix24-send` — marcar mensagens enviadas
Após enviar mensagem ao Bitrix24, inserir no `sync_dedup_cache`:
```js
{ entity_type: 'message', entity_id: conversationId, external_id: messageImId, source: 'emmely' }
```

#### 6. Modificar `bitrix24-events` — dedup de eventos CRM
Antes de enfileirar, verificar se o evento já foi processado recentemente (mesmo `event_type` + `member_id` + entity ID no cache).

#### 7. Reforçar dedup existente em `whatsapp-webhook` e `wuzapi-webhook`
Já verificam `external_id` na tabela `messages`. Adicionar também check no `sync_dedup_cache` para mensagens enviadas pelo Emmely.

### Ficheiros a Criar/Modificar

| Ficheiro | Ação |
|---|---|
| Migration SQL | Criar — tabela `sync_dedup_cache` + coluna `sync_source` em `messages` |
| `supabase/functions/bitrix24-worker/index.ts` | Editar — dedup em `handleConnectorMessage` + cleanup TTL |
| `supabase/functions/bitrix24-send/index.ts` | Editar — registar no cache após envio |
| `supabase/functions/bitrix24-events/index.ts` | Editar — dedup de eventos CRM antes de enfileirar |
| `supabase/functions/message-send/index.ts` | Editar — registar `sync_source` nas mensagens outbound |

