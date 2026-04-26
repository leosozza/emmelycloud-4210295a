# Corrigir recepção WhatsApp BR — LID vs número real e vínculo com Deal

## Diagnóstico

Validei nos logs do `wuzapi-webhook`. O número que você enviou (11978659280) chegou, mas:

```
Chat:   "196847578665004@lid"   ← identificador anônimo do WhatsApp (LID)
Sender: "55119786...@s.whatsapp.net"  ← número real (truncado no log)
```

Desde 2024 o WhatsApp passou a entregar mensagens com **dois identificadores**:
- **`@lid`** — Linked ID, um hash anônimo da conta (não é telefone)
- **`@s.whatsapp.net`** — o número real internacional

O WUZAPI v2 envia os dois no payload (`Info.Chat` = LID, `Info.Sender` = número real). O código atual de `wuzapi-webhook` faz:

```ts
const chatJid = info.Chat || info.RemoteJid || ... || info.Sender || "";
```

Como `Chat` vem preenchido com o LID, ele **nunca cai** no `Sender`. Resultado: gravamos `196847578665004@lid` como `contact_phone` e enviamos esse mesmo "número" para o `bitrix24-send`, que:
1. Cria/encontra um contato no Bitrix com `PHONE = 196847578665004@lid` (lixo)
2. Não consegue casar com o Deal #23691, que está vinculado ao número real `+5511978659280`
3. Por isso aparece o `@lid` no card e o deal não vincula

O problema afeta **só conversas em PV de números BR/novos** (grupos e contatos antigos ainda chegam com `@s.whatsapp.net` no `Chat`).

## O que vamos corrigir

### 1. Extrair sempre o número real no `wuzapi-webhook`
Mudar a ordem de prioridade e isolar LID:

```ts
// Número real para identificação (Bitrix, Deal, contato)
const senderJid = info.Sender || info.sender || "";
const chatJid   = info.Chat || info.RemoteJid || info.remoteJid || "";

// Telefone real: preferir Sender (sempre @s.whatsapp.net), nunca @lid
const realPhoneJid = !senderJid.includes("@lid") ? senderJid : "";
const phone = realPhoneJid
  ? realPhoneJid.replace(/@.*$/, "")
  : (chatJid.includes("@lid") ? "" : chatJid.replace(/@.*$/, ""));

// LID guardado em paralelo só para envio (WUZAPI exige LID para responder)
const lidJid = chatJid.includes("@lid") ? chatJid : (senderJid.includes("@lid") ? senderJid : null);
```

- `contact_phone` na tabela `conversations` passa a guardar **o número real** (ex: `5511978659280`)
- Adicionar coluna `contact_lid` em `conversations` para guardar o `@lid` (necessário para o `message-send` continuar respondendo via WUZAPI)
- Quando só houver LID (caso raríssimo), gravar como `lid:196847578665004` em vez de tratar como telefone

### 2. Migração no banco
- `ALTER TABLE conversations ADD COLUMN contact_lid TEXT NULL`
- Backfill: para conversas existentes onde `contact_phone LIKE '%@lid'`, mover o valor para `contact_lid` e marcar `contact_phone = NULL` (impede que fiquem "presas" como contato fantasma)
- Índice em `contact_lid`

### 3. Ajustar `message-send` (WUZAPI)
- Ao enviar resposta: se `conversation.contact_lid` existir, usar o LID como destino (WUZAPI exige isso para entregar). Se não, usar `contact_phone`.

### 4. Repassar o número correto ao `bitrix24-send`
- `contactId` enviado ao Bitrix passa a ser o número real (`5511978659280`), não mais o LID
- Isso permite o `bitrix24-send` casar com o Contact / Deal #23691 existente via busca por telefone (`crm.duplicate.findbycomm` ou equivalente)

### 5. Verificar matching de telefone no `bitrix24-send`
- Conferir se a busca de contato no Bitrix usa `crm.duplicate.findbycomm` com `TYPE=PHONE` e variantes (`5511978659280`, `+5511978659280`, `11978659280`). Se não estiver normalizando, normalizar para E.164 antes da busca.
- Se o contato vier de Deal já vinculado via portfólio, priorizar o `CONTACT_ID` do deal antes de criar novo.

### 6. Limpeza opcional (sob aprovação)
- Listar conversas/contatos do Bitrix criados como `*@lid` nos últimos dias (você decide se quer mesclar manualmente ou deixar uma rotina de merge)

## Arquivos afetados
- `supabase/functions/wuzapi-webhook/index.ts` — extração de JID
- `supabase/functions/bitrix24-send/index.ts` — normalização do telefone + duplicate-find
- `supabase/functions/message-send/index.ts` — usar LID quando disponível
- Nova migração SQL — coluna `contact_lid` + backfill + índice

## Como vou validar
1. Ler payload completo nos logs para confirmar formato exato do `Sender`
2. Após implementar, pedir para você reenviar uma mensagem do 11978659280
3. Conferir nos logs: `phone = 5511978659280`, `lid = 196847578665004@lid`, `bitrix24-send` recebe `contactId=5511978659280`
4. Verificar no Bitrix se a mensagem entrou no Deal #23691 e se o card mostra o telefone correto

## Fora de escopo
- Não vou mexer no fluxo Meta (oficial) — esse já recebe número real direto
- Não vou criar UI de gerenciamento de LIDs

Aguardando aprovação para implementar.
