
# Corrigir Lookup da Conversa na Aba "Emmely AI" do Bitrix24

## Problema raiz identificado nos logs

O log mostra exatamente o que falha:

```
PLACEMENT_OPTIONS=%7B%22ID%22%3A%228109%22%7D
→ Decodificado: {"ID":"8109"}
```

O Bitrix24 envia **`ID`** (não `ENTITY_ID`), por isso o código lê `placementOptions.ENTITY_ID` que é sempre `undefined` — e o `entityId` fica vazio, o lookup nunca acontece.

Adicionalmente:
- O token já vem no body como `AUTH_ID` + `SERVER_ENDPOINT` — pode ser usado diretamente (mais rápido e sem precisar do refresh)
- As conversas do Instagram **não têm `contact_phone`** — têm `contact_instagram` (ID numérico do utilizador Instagram)
- O Lead do Bitrix24 pode ter email, telefone e campos personalizados — a busca deve ser exaustiva

## Correções a implementar em `supabase/functions/bitrix24-crm-tab/index.ts`

### Fix 1 — Ler corretamente o `ENTITY_ID` do `PLACEMENT_OPTIONS`

```typescript
// ANTES (errado):
const entityId = placementOptions.ENTITY_ID || placementOptions.entity_id || body.ENTITY_ID || "";

// DEPOIS (correto):
const entityId = 
  placementOptions.ID ||           // ← campo real enviado pelo Bitrix24
  placementOptions.ENTITY_ID ||    // fallback
  placementOptions.entity_id ||
  body.ENTITY_ID || "";
```

### Fix 2 — Usar o token temporário do body diretamente

O Bitrix24 envia `AUTH_ID` e `SERVER_ENDPOINT` no body do placement. Estes são válidos por 1 hora — mais rápido do que buscar e fazer refresh da integração armazenada:

```typescript
// Usar token do body se disponível
const authToken = body.AUTH_ID || body.auth_id || accessToken;
const serverEndpoint = body.SERVER_ENDPOINT 
  ? decodeURIComponent(body.SERVER_ENDPOINT) 
  : endpoint;
```

### Fix 3 — Lookup multi-campo, multi-entidade exaustivo

Para cada entidade (Lead, Deal, Contact, SPA), extrair TODOS os identificadores possíveis e fazer lookup sequencial:

**Campos a extrair do CRM:**
- `PHONE` → array de telefones → busca por `contact_phone ILIKE %phone%`
- `EMAIL` → array de emails → busca por `contact_email ILIKE %email%`
- `NAME` / `LAST_NAME` → busca por `contact_name ILIKE %name%` (fallback)

**Para Deal (entity_type=2):** também buscar o Contacto vinculado (`CONTACT_ID`) e extrair os telefones/emails dele.

**Lookup de Instagram:** as conversas do Instagram têm `contact_instagram` com o ID numérico do utilizador. O Lead no Bitrix24 pode ter num campo personalizado ou no nome. O lookup por nome é feito como último fallback.

```typescript
// Sequência de lookup:
// 1. Por telefone (contact_phone ILIKE %phone%)
// 2. Por email (contact_email ILIKE %email%)  
// 3. Para Deal: repetir 1+2 com dados do Contacto vinculado
// 4. Por bot_state.bitrix_lead_id ou bitrix_entity_id
// 5. Por nome (contact_name ILIKE %name%) — só se nome tem >5 chars
```

### Fix 4 — Botão "Iniciar Conversa" quando não há conversa

Quando não existe conversa, em vez de só mostrar "Nenhuma conversa encontrada", mostrar botões para iniciar via WhatsApp ou Instagram (dependendo das instâncias ativas).

A lógica:
1. Buscar o `chatbot_channel_settings` ativo (WhatsApp e/ou Instagram)
2. Extrair o número de telefone do Lead
3. Mostrar botão "Iniciar no WhatsApp" que envia mensagem de abertura via edge function `message-send`

```typescript
// Quando não há conversa, renderizar botão de iniciar:
<button onclick="startConversation('whatsapp')">
  💬 Iniciar Conversa no WhatsApp
</button>
```

O clique chama a `message-send` edge function com o telefone extraído do Lead e uma mensagem de abertura, criando a conversa no sistema.

## Ficheiros a modificar

### `supabase/functions/bitrix24-crm-tab/index.ts` (único ficheiro)

Mudanças completas:

1. **Parsing do `entityId`**: ler `placementOptions.ID` como campo primário
2. **Token temporário**: usar `AUTH_ID` + `SERVER_ENDPOINT` do body
3. **Lookup expandido**: telefone → email → contacto vinculado (Deal) → bot_state → nome
4. **Estado "sem conversa"**: mostrar telefones encontrados + botão para iniciar conversa via WhatsApp se houver número disponível
5. **Suporte a todas as entidades**: Lead (1), Deal (2), Contact (3), Company (4), SPA (dynamic)

## Fluxo detalhado após a correção

```text
POST do Bitrix24:
  AUTH_ID=xxx, SERVER_ENDPOINT=https://oauth.bitrix.info/rest/, 
  member_id=yyy, PLACEMENT_OPTIONS={"ID":"8109"}
  
                    ↓ Fix 1: entityId = "8109" ✓
                    ↓ Fix 2: usa AUTH_ID como token direto
                    
callBitrix("crm.lead.get", {ID: "8109"})
  → entity.PHONE = [{VALUE: "+351911234567"}]
  → entity.EMAIL = [{VALUE: "cliente@email.com"}]
  → entity.NAME = "Reencaminhar: Documentos Pai/Mai"
  
Lookup sequencial:
  1. contact_phone ILIKE %351911234567% → tenta
  2. contact_email ILIKE %cliente@email.com% → tenta
  3. bot_state.bitrix_lead_id = "8109" → tenta
  4. contact_name ILIKE %Reencaminhar% → tenta
  
Se não encontra → mostra botão "Iniciar WhatsApp" com o número do Lead
Se encontra → mostra histórico + botão devolver ao bot
```

## Resultado esperado

A aba "Emmely AI" vai:
- Encontrar conversas existentes via telefone, email ou nome
- Para Deals, também buscar nos dados do Contacto vinculado
- Quando não houver conversa, mostrar os dados do Lead encontrado e um botão para iniciar a conversa diretamente pelo WhatsApp (se houver número disponível)
- Usar o token temporário do body para chamadas mais rápidas

Após o deploy, é necessário reabrir o detalhe do Lead no Bitrix24 para que o placement recarregue.
