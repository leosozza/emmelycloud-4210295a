# Diagnóstico

## O que aconteceu no teste do deal 26797

A análise dos logs (`bitrix24_debug_logs` + edge logs) mostra a sequência:

1. **20:56** — Mensagem **enviada do Emmely → Bitrix24** com sucesso (`event_type: message_sent`, lineId 19, connector `emmely_connector`).
2. **20:57 e 20:58** — Tu respondeste no chat do deal 26797 no Bitrix24. O webhook chegou ao `bitrix24-worker`, resolveu o `contactId = 5511978659280`, mas registou **`event_type: no_conversation`** (log: *"No conversation for contact: 5511978659280"*).
3. Como não encontrou a conversa, **não encaminhou a resposta** para o WhatsApp e **não vinculou o placement** (que procura conversa pelo telefone do deal).

## Causa raiz

A query no worker usa `.maybeSingle()`:

```ts
const { data: conversation } = await supabase
  .from("conversations")
  .select(...)
  .or(`contact_phone.eq.${contactId},contact_phone.eq.${contactId}@lid,...`)
  .maybeSingle();
```

A BD tem **duas conversas com o mesmo `contact_phone = 5511978659280`** (Thoth24):

| id | contact_phone | contact_lid | created_at |
|---|---|---|---|
| `df886b15…` | 5511978659280 | 196847578665004 | 2026-04-26 16:16 |
| `89c299f8…` | 5511978659280 | 196847578665004@lid | 2026-04-14 19:41 |

Quando `.maybeSingle()` recebe **mais de uma linha**, devolve `data: null` silenciosamente — a conversa "desaparece" para o worker. O placement `bitrix24-crm-tab` (aba *Conversa*) usa o mesmo padrão `.maybeSingle()` em vários sítios, por isso também mostra "Nenhuma conversa ativa encontrada".

# Correções

## 1. `supabase/functions/bitrix24-worker/index.ts` (lookup de conversa para reencaminhar resposta)

- Trocar `.maybeSingle()` por `.order("last_message_at", { ascending: false }).limit(1)` e usar `data?.[0]`. Assim, se houver duplicados, escolhemos sempre o **mais recente** (a conversa "viva").
- Ao receber `bitrix_chat_id`, persistir nessa conversa mais recente.

## 2. `supabase/functions/bitrix24-crm-tab/index.ts` (placement do deal)

Mesmo tratamento — substituir todos os `.maybeSingle()` que procuram conversa por telefone/LID por `order(...).limit(1)`. Atinge as queries das linhas ~100, 110, 128, 137, 231, 240, 1073, 1080, 1092, 1105, 1155, 1160.

## 3. Consolidação dos duplicados existentes (one-shot SQL)

Migration que:
- Para cada `contact_phone` com >1 conversa do mesmo `channel`, mantém o registo com `last_message_at` mais recente.
- Move as `messages` das conversas antigas para a sobrevivente (UPDATE `conversation_id`).
- Apaga as conversas antigas.
- Adiciona índice único parcial `(contact_phone, channel) WHERE contact_phone IS NOT NULL AND status <> 'arquivada'` para evitar criação futura de duplicados (na prática só impede 2 ATIVAS — arquivadas continuam a poder coexistir).

## 4. `bitrix24-webhook` (criação de conversas) — guarda

Antes de inserir nova conversa, fazer um `select … order(last_message_at desc).limit(1)` por `(contact_phone, channel)` e reutilizar se existir. Isto previne novas duplicatas mesmo se a constraint única for permissiva.

# Detalhes técnicos

- A função `maybeSingle()` do PostgREST devolve erro `PGRST116` quando há >1 linha, mas o destructuring `{ data, error }` ignora `error` em todos estes pontos — por isso a falha era silenciosa. A nova abordagem com `limit(1)` é determinística.
- Conversas com `contact_lid` com e sem sufixo `@lid` partilhando `contact_phone` continuam a coexistir como rows distintas se o `status` for `arquivada` — não rebenta o índice.
- Não tocamos no `message-send` nem na cadeia de envio para WhatsApp; o problema está apenas no lookup.

# O que vai acontecer depois do fix

- Respondes no deal 26797 → worker encontra a conversa `df886b15…` → `message-send` reencaminha para o WhatsApp do cliente.
- O placement *Conversa* na ficha do deal mostra a conversa ativa em vez de "Nenhuma conversa ativa encontrada".
- Futuras duplicações ficam barradas pelo índice único parcial + reutilização no webhook.
