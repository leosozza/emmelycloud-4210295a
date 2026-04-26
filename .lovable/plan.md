## Diagnóstico (confirmado em produção)

Identifiquei **três bugs** na conversa do número `+5511978659280` (LID `196847578665004`):

**1. `contact_phone` ficou nulo na nova conversa**
- Na tabela `conversations`, a linha tem `contact_phone = NULL` e `contact_lid = "196847578665004"`.
- Isso indica que o payload da WUZAPI deste número trouxe **só** o JID com `@lid` em ambos os campos `Chat` e `Sender` — então a função `wuzapi-webhook` não conseguiu extrair o telefone real.

**2. Bitrix recebeu o LID como identificador (não o telefone)**
- A `bitrix24-send` enviou `chat.id = "196847578665004"` e `user.id = "196847578665004"` no `imconnector.send.messages`.
- Como **não passamos o campo `user.phone`** com `skip_phone_validate: "Y"` (suportado pela API conforme documentação oficial), o Bitrix24 não tem como casar com o Contato/Deal existente — então cria um contato novo "sem contacto" (foi exatamente o que apareceu na sua tela).

**3. Resposta do operador no Bitrix nunca volta ao WhatsApp**
- Confirmei na fila `bitrix_event_queue`: chegaram **2 eventos `ONIMCONNECTORMESSAGEADD`** ("teste bitrix" e "envio 13:17") com `chat.id = "196847578665004"`.
- O `bitrix24-worker` (linha 416-420) procura a conversa só por:
  ```
  contact_phone.eq.<id> OR contact_phone.eq.<id>@lid OR contact_instagram.eq.<id>
  ```
  Como agora o LID está em `contact_lid`, **a query não encontra a conversa** e a mensagem do operador é descartada silenciosamente.

---

## Correções propostas

### A. `bitrix24-worker` — incluir `contact_lid` no lookup
No handler `handleConnectorMessage` (linha ~416), expandir o `.or()` para também procurar por `contact_lid.eq.<id>`. Assim a resposta do Bitrix encontra a conversa correta e dispara `message-send`, que já sabe usar o LID para enviar via WUZAPI.

### B. `bitrix24-send` — passar telefone real ao Bitrix para casar com a Deal
Aceitar um novo parâmetro opcional `contactPhone` no body. Quando presente, incluir no `imconnector.send.messages`:
```js
user: {
  id: contactId,
  name: contactName,
  phone: "+" + contactPhone,         // ex: "+5511978659280"
  skip_phone_validate: "Y"
}
```
Isto faz o Bitrix vincular automaticamente ao Contato/Deal existente que tem esse telefone — exatamente o comportamento que estava acontecendo antes da mudança para LID.

### C. `wuzapi-webhook` — enviar o telefone real ao `bitrix24-send`
Passar `contactPhone: phone` no fetch para `bitrix24-send` quando o telefone real foi extraído.

### D. `wuzapi-webhook` — fallback para resolver telefone real do LID
Quando o payload trouxer **só** LID (caso atual), tentar:
1. **Lookup local primeiro**: procurar em `conversations` por `contact_lid = <lid>` que já tenha `contact_phone` preenchido (de mensagens anteriores ou backfill).
2. **Lookup WUZAPI**: chamar o endpoint `/user/info` da WUZAPI passando o JID com `@lid` — a API retorna o `VerifiedName`/`PushName` e, em muitos casos, o número real associado.
3. Se mesmo assim não houver telefone, gravar a conversa só com LID (comportamento atual) e o Bitrix criará contato sem telefone — sem regressão.

### E. Backfill da conversa atual
Atualizar a linha `df886b15-d9e4-404a-9389-44345f5bf011` (e `89c299f8-...`) com `contact_phone = "5511978659280"`, para que as próximas respostas do operador no Bitrix já encontrem a conversa por telefone **e** o placement Emmely Pay vincule à Deal correta.

---

## Detalhes técnicos

**Arquivos editados:**
- `supabase/functions/bitrix24-worker/index.ts` — adicionar `contact_lid.eq.${contactId}` no `.or()` da busca de conversas (linha ~419) e logar quando o match foi via LID.
- `supabase/functions/bitrix24-send/index.ts` — aceitar `contactPhone` no body, propagar para `sendWithFallbacks`, incluir `phone` + `skip_phone_validate: "Y"` no `user` do `imconnector.send.messages`.
- `supabase/functions/wuzapi-webhook/index.ts` — adicionar resolver `resolveRealPhone(lid)`: 1) busca em `conversations` pelo LID, 2) chama `/user/info` da WUZAPI; usar o resultado para preencher `contact_phone` da nova conversa e enviar `contactPhone` ao `bitrix24-send`.
- **SQL migration**: backfill `UPDATE conversations SET contact_phone = '5511978659280' WHERE id IN ('df886b15-d9e4-404a-9389-44345f5bf011', '89c299f8-e903-4d42-b498-759bdce639ed')`.

**Confirmação MCP Bitrix24:** A documentação oficial de `imconnector.send.messages` lista `user.phone` + `user.skip_phone_validate: "Y"` como campos válidos justamente para permitir match automático com Contato/Deal por telefone (sem disparar a validação de formato do Bitrix).

**Sem mudanças em:** `message-send` (já sabe usar `contact_lid` para enviar via WUZAPI), `bitrix24-events`, schema da tabela `conversations`.

---

## Resultado esperado após o fix

- Operador responde no Bitrix → mensagem chega no WhatsApp do cliente (via WUZAPI usando o LID).
- O placement (Emmely AI / Emmely Pay) vincula à Deal `23855` existente, em vez de criar contato fantasma.
- Mensagens futuras do mesmo número continuam funcionando mesmo se o WhatsApp só entregar LID.
