## Problema

No Deal #31035 (Paulo Neto Cigano) a aba "Emmely AI" mostra "Nenhuma conversa ativa encontrada", apesar da conversa existir (`3bcf8edc-693e-4f60-8094-5e272d074acf`).

**Causa raiz:** este contacto chegou via WhatsApp pelo WUZAPI usando apenas LID (`36777922437277@lid`). Os logs confirmam: `phone: (none) | lid: 36777922437277` e `/user/info did not return a real phone, keeping LID only`. A conversa fica gravada com `contact_phone = null` e apenas `contact_lid = 36777922437277`.

A função `bitrix24-crm-tab` faz lookup por:
1. `leads.bitrix24_id` 2. `bot_state.bitrix_deal_id/lead_id/entity_id` 3. telefone 4. email 5. `clients.bitrix24_id` 6. nome.

Nenhum desses caminhos consulta o **LID**, portanto a conversa nunca é casada com o Deal — e o `bitrix24-worker` também não escreve `bitrix_entity_id` no `bot_state` porque também depende de `contact_phone` para procurar no Bitrix.

## Solução

Duas correções complementares no `supabase/functions/bitrix24-crm-tab/index.ts` (zero alteração de schema, zero front-end):

### 1. Novo lookup determinístico por LID via Open Channel Activity

Quando o placement carrega o Deal:

- Chamar `crm.activity.list` com `filter: { OWNER_ID: dealId, OWNER_TYPE_ID: 2, PROVIDER_ID: "IMOPENLINES_SESSION" }` e `select: ["ID","PROVIDER_PARAMS","COMMUNICATIONS","ASSOCIATED_ENTITY_ID"]`.
- Para cada actividade, extrair o `chat_id` da Open Channel (vem em `PROVIDER_PARAMS.USER_CODE` no formato `imol|emmely_connector|19|36777922437277|...` ou em `COMMUNICATIONS[].VALUE`).
- Repetir para o Contact ligado (`OWNER_TYPE_ID: 3, OWNER_ID: CONTACT_ID`).
- Recolher todos os LIDs candidatos e consultar `conversations` com `.in("contact_lid", lids)` (canal `whatsapp`), preferindo as não-fechadas e mais recentes.

### 2. Cache do `bitrix_entity_id` quando casar pelo LID

Após casar via LID, gravar no `bot_state` da conversa:
```ts
{ ...bot_state, bitrix_entity_id: `${entityTypeId}:${entityId}` }
```
Assim, a próxima abertura do placement (e o `bitrix24-worker` para badges) acerta imediatamente sem chamar `crm.activity.list`.

### Posicionamento na cadeia de lookups

Inserir o novo passo **entre o passo 2 (bot_state) e o passo 3 (telefone/email)**, para preservar a ordem determinística → heurística que já existe.

## Detalhes técnicos

- Arquivo único: `supabase/functions/bitrix24-crm-tab/index.ts`.
- Helper novo: `findConversationByOpenChannelChatId(supabase, endpoint, accessToken, entityTypeNum, entityId, contactId?)`.
- Regex tolerante para extrair o chat_id de `USER_CODE`: `/\|(\d{10,})(?:\||$)/`.
- Fallback: se `crm.activity.list` falhar ou vier vazio, registar `console.warn` e seguir para os lookups de telefone existentes (sem regressão).
- Sem mudança de tipos/RLS/migrations.

## Como validar

1. Abrir o iframe Emmely AI no Deal #31035 → deve listar a conversa de Paulo Neto Cigano.
2. Ver logs `[CRM-TAB] ✓ Matched via openchannel LID: 36777922437277`.
3. Recarregar uma 2ª vez → log esperado: `[CRM-TAB] ✓ Matched via bot_state` (cache).
4. Próxima mensagem do mesmo contacto → o badge do `bitrix24-worker` passa a aparecer (já tem `bitrix_entity_id` em cache).
