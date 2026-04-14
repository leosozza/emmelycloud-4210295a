

## Diagnóstico

O Deal 23693 ("Ailson França") não encontra a conversa porque:

1. **Sem telefone/email** — O Deal e o Contacto vinculado não têm telefone/email no Bitrix24 (logs: `phones: [] emails: []`)
2. **bot_state desalinhado** — A conversa tem `bitrix_entity_id: "1:17805"` (Lead), mas o CRM Tab procura pelo Deal ID `23693`. A busca tenta `entity.LEAD_ID` mas provavelmente o Deal não tem esse campo
3. **contact_phone inválido** — A conversa tem `10677389394164@lid` (formato LID do Bitrix), que não é um telefone real
4. **Name fallback falha** — O nome "Ailson França - WhatsApp BR" deveria encontrar "Ailson França" na conversa, mas algo impede (possivelmente o Deal não retorna o TITLE esperado)

## Plano de Correção

### 1. Adicionar lookup por `contact_phone` com formato LID
**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

Antes do name fallback, adicionar uma busca pela `contact_phone` que contenha o formato `@lid` usado pelo Bitrix. Extrair o phone_number_id do Contacto vinculado e procurar conversas com `contact_phone` contendo esse ID.

### 2. Adicionar lookup direto por nome do Deal/Contacto no `contact_name`
O name fallback atual usa `ilike` mas pode estar a falhar silenciosamente. Adicionar logs de debug e garantir que o nome do Contacto (não o título do Deal) é usado na busca.

### 3. Gravar `bitrix_deal_id` no `bot_state` quando o Deal é identificado
**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

Quando a conversa é encontrada por qualquer método, atualizar o `bot_state` da conversa com `bitrix_deal_id: entityId` para que lookups futuros sejam instantâneos:
```javascript
if (conversation && entityTypeNum === 2) {
  await supabase.from("conversations").update({
    bot_state: { ...conversation.bot_state, bitrix_deal_id: String(entityId) }
  }).eq("id", conversation.id);
}
```

### 4. Adicionar lookup por Contact ID do Bitrix na tabela `clients`
Para Deals com `CONTACT_ID`, procurar na tabela `clients` por `bitrix24_id` e depois usar o `client_id` para encontrar conversas:
```sql
clients.bitrix24_id = entity.CONTACT_ID → conversations.client_id = clients.id
```

### 5. Adicionar logs de debug em cada passo do lookup
Registar o nome usado no name fallback e o LEAD_ID do Deal para diagnosticar falhas futuras.

## Ficheiros a editar
- `supabase/functions/bitrix24-crm-tab/index.ts` — todos os 5 pontos acima

## Detalhes técnicos
- O `contact_phone` no formato `{number}@lid` é um identificador de linha do Bitrix Open Channel — não é um telefone real
- O `bitrix_entity_id: "1:17805"` indica que a conversa foi originada num Lead Bitrix (type 1, ID 17805) que depois foi convertido no Deal 23693
- A gravação do `bitrix_deal_id` no bot_state cria um vínculo permanente que elimina lookups complexos em acessos futuros

