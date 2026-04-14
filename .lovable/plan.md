

## Diagnóstico

Quando o operador responde pelo bate-papo do Bitrix24, o evento `ONIMCONNECTORMESSAGEADD` é disparado. O worker recebe o payload, mas **não consegue extrair o contactId** porque procura em `msg.user` (que não existe neste tipo de evento).

### Payload real recebido:
```text
MESSAGES: [{
  chat:    { id: "196847578665004" },          ← ID externo do contacto
  im:      { chat_id: "27521", message_id: "..." },
  message: { text: "...", user_id: "9909" }    ← user_id do operador Bitrix
}]
```

### O que o código faz (errado):
```text
msg.user → undefined → contactId = "" → "No contact ID found" → skip
```

### O que deveria fazer:
Usar `msg.chat.id` como contactId externo, depois buscar a conversa por `contact_phone` com o sufixo `@lid` (formato usado pelo WUZAPI).

### Problemas secundários:
1. **`.catch()` na linha 351**: `supabase.from(...).upsert(...).catch()` não funciona — o client Supabase não retorna uma Promise rejeitável. Causa crash `TypeError`.
2. **Lookup da conversa**: A query usa `contact_phone.eq.${contactId}` mas o valor guardado é `196847578665004@lid`. Precisa tentar ambos os formatos.
3. **Detecção de mensagem do operador vs bot**: O texto vem com prefixo `[b]Leonardo de Souza:[/b]` — precisa garantir que `isBotMessage` não bloqueia e que o prefixo é limpo antes de reenviar.

---

## Plano de Correção

### Ficheiro: `supabase/functions/bitrix24-worker/index.ts`

**1. Corrigir extração do contactId (linhas 387-405)**

Substituir a lógica atual que procura em `msg.user` por:
- Usar `msg.chat.id` ou `msg.CHAT.ID` como contactId externo
- Fallback para `msg.message.user_id` se `chat.id` não existir

**2. Corrigir lookup da conversa (linhas 407-412)**

A query atual faz `contact_phone.eq.${contactId}` mas o valor na DB é `196847578665004@lid`. Alterar para tentar ambos:
- `contact_phone.eq.${contactId}`
- `contact_phone.eq.${contactId}@lid`

Usar `.or(...)` com os dois formatos.

**3. Corrigir `.catch()` (linha 351)**

Substituir `.catch(() => {})` por um bloco `try/catch` ou simplesmente ignorar o resultado (sem `.catch`).

**4. Limpar prefixo do operador**

O texto `[b]Leonardo de Souza:[/b] [br]Resposta Bitrix 15` já passa pelo `stripBBCode`, que remove as tags BB. Verificar que o resultado final é limpo (ex: "Resposta Bitrix 15" sem o nome do operador duplicado se o canal já identifica o remetente).

**5. Deploy e teste**

- Deploy da edge function
- Enviar mensagem pelo WhatsApp → Bitrix (já funciona)
- Responder pelo bate-papo do Bitrix → verificar que chega ao WhatsApp

