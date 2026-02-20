
# Aba "Emmely AI" no Detalhe de Lead do Bitrix24 (CRM_LEAD_DETAIL_TAB)

## O que vai ser construído

Ao registar o placement `CRM_LEAD_DETAIL_TAB`, vai aparecer uma aba "Emmely AI" em cada Lead/Contacto do Bitrix24 (como o WhatCRM tem a aba "Whatsapp"). Ao clicar nessa aba, abre um iframe com a conversa do cliente ligada a esse Lead — mostrando o histórico de mensagens, o modo de atendimento atual (bot/humano) e um botão para devolver ao bot.

## Como funciona o placement CRM_LEAD_DETAIL_TAB

O Bitrix24 ao abrir o detalhe de um Lead passa os seguintes dados no PLACEMENT_OPTIONS do POST para o handler:
- `ENTITY_TYPE_ID` — tipo de entidade (1=Lead, 2=Deal, 3=Contact, etc.)
- `ENTITY_ID` — ID numérico do Lead/Deal/Contact
- `member_id` — identifica a integração

O handler (uma Edge Function) recebe estes dados, faz lookup da conversa associada ao Lead/Contact, e retorna HTML renderizado dentro do iframe da aba.

## Arquitetura da solução

```text
Bitrix24 Lead Detail Page
  └─ Aba "Emmely AI" (CRM_LEAD_DETAIL_TAB)
       └─ iframe → Edge Function: bitrix24-crm-tab
                    ├─ Recebe ENTITY_ID + ENTITY_TYPE_ID + member_id
                    ├─ Lookup: busca conversa por ENTITY_ID no campo bot_state.bitrix_lead_id
                    │          OU por telefone do Lead via imopenlines.session.list
                    ├─ Renderiza HTML com:
                    │   ├─ Histórico das últimas 20 mensagens
                    │   ├─ Badge: modo bot / humano
                    │   ├─ Botão "Devolver ao Bot"
                    │   └─ Campo para enviar mensagem manual
                    └─ Retorna HTML com X-Frame-Options: ALLOWALL
```

## Ficheiros a criar/modificar

### 1. Nova Edge Function: `supabase/functions/bitrix24-crm-tab/index.ts`
- Handler do placement `CRM_LEAD_DETAIL_TAB`
- Recebe POST do Bitrix24 com `PLACEMENT_OPTIONS` contendo `ENTITY_ID` e `ENTITY_TYPE_ID`
- Lookup da conversa: busca por `bot_state->>'bitrix_lead_id'` OU por telefone do Lead (via `callBitrix → crm.lead.get`)
- Renderiza HTML completo com:
  - Cabeçalho com nome do contacto e badge de modo
  - Histórico das últimas 20 mensagens (botões de devolver ao bot)
  - Se não encontrar conversa: mensagem informativa

### 2. Modificar `supabase/functions/bitrix24-rebind-events/index.ts`
- Adicionar registo do placement `CRM_LEAD_DETAIL_TAB` na função de rebind
- Unbind primeiro para evitar duplicados
- Bind com TITLE "Emmely AI", HANDLER apontando para `bitrix24-crm-tab`

### 3. Modificar `supabase/functions/bitrix24-install/index.ts`
- Adicionar registo do placement `CRM_LEAD_DETAIL_TAB` durante a instalação (ao lado do `IM_TEXTAREA` que já existe)

## Detalhes técnicos da Edge Function `bitrix24-crm-tab`

```typescript
// Lógica de lookup da conversa
// 1. Obter dados do Lead no Bitrix24
const leadData = await callBitrix(endpoint, token, "crm.lead.get", { ID: entityId });
const phone = leadData.result?.PHONE?.[0]?.VALUE || "";

// 2. Buscar conversa por telefone
const cleanPhone = phone.replace(/\D/g, "");
const conv = await supabase.from("conversations")
  .select("id, contact_name, attendance_mode, channel")
  .ilike("contact_phone", `%${cleanPhone}%`)
  .neq("status", "fechada")
  .limit(1).single();

// 3. Buscar mensagens
const msgs = await supabase.from("messages")
  .select("content, direction, created_at, sender_name")
  .eq("conversation_id", conv.id)
  .order("created_at", { ascending: false })
  .limit(20);
```

O HTML renderizado vai usar estilos inline (sem dependências externas) para ficar visual dentro do iframe do Bitrix24, com cores adaptadas ao tema do portal.

## Placement binding

```typescript
await callBitrix(endpoint, token, "placement.bind", {
  PLACEMENT: "CRM_LEAD_DETAIL_TAB",
  HANDLER: `${supabaseUrl}/functions/v1/bitrix24-crm-tab`,
  TITLE: "Emmely AI",
  DESCRIPTION: "Conversa e histórico do cliente",
  LANG_ALL: {
    pt: { TITLE: "Emmely AI" },
    en: { TITLE: "Emmely AI" },
  },
});
```

## Resultado final

Após o rebind, em cada Lead do Bitrix24 vai aparecer uma aba **"Emmely AI"** (como a aba "Whatsapp" do WhatCRM). Ao clicar:
- Mostra o histórico de mensagens do cliente
- Indica se está em modo **bot** ou **humano**
- Tem botão **"Devolver ao Bot"** que chama a edge function existente
- Se não houver conversa associada, mostra uma mensagem clara

O utilizador também precisará de clicar em **"Re-registar Eventos"** no Dashboard do iframe para ativar o placement na instalação existente (sem precisar de reinstalar a app).
