

## Problema
O PowerZap é um conector de WhatsApp de terceiros instalado no Contact Center do Bitrix24, mas o sistema Emmely usa sempre `emmely_connector` como ID fixo. Quando envia mensagens via `bitrix24-send`, usa `emmely_connector` — que pode não ser o conector activo no Open Line. O PowerZap não aparece como opção seleccionável.

## Solução

### 1. Detectar conectores instalados no portal (`bitrix24-worker`)
Adicionar uma acção `listConnectors` ao worker que chama `imconnector.list` no Bitrix24 e retorna todos os conectores registados (filtrando os built-in como `livechat`, `facebook`, etc.), para que o frontend possa mostrar PowerZap e outros no selector.

### 2. Guardar o conector preferido na tabela `bitrix24_channel_mappings`
A tabela já mapeia `line_id` → `channel`. Adicionar um campo `connector_id` (default `emmely_connector`) para guardar qual conector usar em cada Open Line.

**Migração SQL:**
```sql
ALTER TABLE bitrix24_channel_mappings 
ADD COLUMN IF NOT EXISTS connector_id text DEFAULT 'emmely_connector';
```

### 3. Usar o `connector_id` do mapping ao enviar (`bitrix24-send`)
Na função `bitrix24-send`, ao buscar o `channel_mapping`, usar o `connector_id` guardado no mapping em vez do `DEFAULT_CONNECTOR_ID`. Isto faz com que se o PowerZap estiver configurado nessa linha, as mensagens saiam pelo PowerZap.

### 4. Permitir seleccionar o conector no frontend (Configuração Bitrix24)
No simulador `/bitrix24` ou na página de configurações, adicionar um dropdown que lista os conectores detectados (via acção `listConnectors`) e permite associar um conector a cada Open Line.

### Ficheiros a alterar
- `supabase/functions/bitrix24-worker/index.ts` — nova acção `listConnectors`
- `supabase/functions/bitrix24-send/index.ts` — usar `mapping.connector_id`
- `supabase/functions/bitrix24-connector-settings/index.ts` — guardar `connector_id` no mapping
- `src/pages/Bitrix24App.tsx` — dropdown de selecção de conector
- **Migração SQL** — campo `connector_id` em `bitrix24_channel_mappings`

### Resultado esperado
- O PowerZap aparece como opção seleccionável no dropdown de conectores
- Mensagens enviadas usam o conector configurado para cada Open Line
- O `emmely_connector` continua como fallback padrão

