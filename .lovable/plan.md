
## Diagnóstico

**Logs do edge `bitrix24-crm-tab` para o deal 35873:**
```
[CRM-TAB] crm.deal.get returned empty result for ID 35873
phone resolution: { contactName: "", phones: [], contactId: null, leadId: null }
```

O Bitrix24 está a devolver `result: null` (sem erro) ao chamar `crm.deal.get` mesmo o deal existindo (URL `/crm/deal/details/35873/` mostra €90 + contacto JORGE LUEMBA). Isto acontece tipicamente quando:
1. O token OAuth pertence a um utilizador sem permissão de leitura naquele pipeline/categoria
2. O método `crm.deal.get` no portal está a usar a v2 e o ID vem como string (a API às vezes ignora silenciosamente)
3. A resposta tem `error` que estamos a descartar — o nosso `callBitrix` não loga falhas

Como o `entity` fica `null`, todo o resto (procurar contactos vinculados, ler telefone) nunca corre — daí "Cliente / sem contacto" e "Nenhum telefone no CRM".

Sobre "não está configurado como conector e provedor de mensagens": o app já regista `imconnector.register` no install, mas:
- O connector não está activo na Open Line por defeito (precisa ser activado em Contact Center → Connect messaging providers, ou o nosso install pode fazê-lo automaticamente para a 1ª linha).
- O app **não** está registado como **SMS Sender** via `messageservice.sender.add`, por isso não aparece no botão "Connect messaging providers" do widget de Message do CRM.

## Correções

### 1. Diagnóstico defensivo em `callBitrix`
`supabase/functions/bitrix24-crm-tab/index.ts`:
- Logar `console.warn` com `method`, `entityId` e `data.error/error_description` sempre que `result` venha falso. Hoje só logamos "returned empty result".
- Permite-nos confirmar se é `ACCESS_DENIED`, `INSUFFICIENT_SCOPE` ou apenas `result: null`.

### 2. Fallbacks robustos para resolver o deal
Quando `crm.deal.get` falhar (entity null) para `entityTypeNum === 2`:
- **Fallback A**: tentar `crm.item.get { entityTypeId: 2, id: entityId }` (endpoint universal, às vezes funciona quando o clássico falha por permissões de leitura).
- **Fallback B**: tentar `crm.deal.list { filter: { ID: entityId }, select: ["ID","TITLE","CONTACT_ID","COMPANY_ID","LEAD_ID","CATEGORY_ID"] }` — `list` usa permissões diferentes em alguns portais.
- **Fallback C** (sempre, independentemente do entity): chamar `crm.deal.contact.items.get { id: entityId }` mesmo quando `entity` é null, e iterar `fetchContactPhones` para cada contacto retornado. Hoje só corremos esta linha se `entity` não for null, mas o método aceita o ID directamente.
- Se ainda assim não houver dados, ler `PLACEMENT_OPTIONS.TITLE` para preencher o cabeçalho do iframe ("JORGE LUEMBA - WhatsApp" em vez de "Cliente").

### 3. Registar Emmely como SMS Sender (`messageservice.sender.add`)
Em `supabase/functions/bitrix24-install/index.ts`, logo após o bloco `imconnector.register`:
- Chamar `messageservice.sender.add` com:
  - `CODE: "emmely_messages"`
  - `TYPE: "SMS"` (necessário para aparecer em "Connect messaging providers")
  - `NAME: "Emmely Messages"`
  - `DESCRIPTION: "WhatsApp / Instagram / SMS via Emmely"`
  - `HANDLER: <edge bitrix24-messageservice-send>` (novo handler, ver passo 4)
- Logar resultado em `bitrix24_debug_logs`.

### 4. Novo edge function `bitrix24-messageservice-send`
Criar `supabase/functions/bitrix24-messageservice-send/index.ts`:
- Recebe POSTs do Bitrix24 quando um utilizador envia uma mensagem pela UI de Message do CRM via "Emmely Messages".
- Lê `MESSAGE_TO` (número), `MESSAGE_BODY`, `MESSAGE_FROM`, `auth.member_id`.
- Resolve a `integration_credentials` da Gupshup e reencaminha como template/sessão para `message-send` interno (a mesma função usada pelo widget CRM Tab).
- Devolve `{result: { STATUS: "delivered", EXTERNAL_ID: ... }}` no formato esperado pelo `messageservice`.

### 5. Activar connector na 1ª Open Line se ainda não estiver activo
No `bitrix24-install/index.ts` após `imconnector.register`:
- Chamar `imopenlines.config.list.get` → escolher a primeira linha.
- Chamar `imconnector.activate { CONNECTOR: "emmely_connector", LINE: <id>, ACTIVE: 1 }` e `imconnector.connector.data.set` (já existe lógica em `bitrix24-connector-settings`, basta extrair para helper partilhado e correr no install).
- Faz com que o botão "Connect messaging providers" mostre "Emmely Messages" como activo sem precisar de configuração manual.

### 6. Validação
1. Reinstalar a app (ou disparar `bitrix24-install` manualmente) — confirmar logs:
   - `messageservice.sender.add: OK`
   - `imconnector.activate LINE=X: OK`
2. Abrir deal 35873 → log deve mostrar `crm.deal.get error:` ou `fallback crm.item.get OK contactId=...` e o iframe deve listar o telefone do JORGE LUEMBA + template HSM.
3. No widget nativo de Message do CRM, clicar "Connect messaging providers" → "Emmely Messages" deve aparecer como opção.

## Ficheiros

- `supabase/functions/bitrix24-crm-tab/index.ts` — diagnóstico + fallbacks A/B/C + PLACEMENT_OPTIONS title.
- `supabase/functions/bitrix24-install/index.ts` — `messageservice.sender.add` + activação automática do connector.
- `supabase/functions/bitrix24-messageservice-send/index.ts` — novo handler para o SMS sender.
- `supabase/config.toml` — registar nova função (`verify_jwt = false`).

## Não incluído

- Migração de dados / mudanças de UI no front. Tudo backend/edge.
- Não vamos forçar reset de Token OAuth — se o `crm.deal.get` der ACCESS_DENIED nos logs, isso fica visível para o utilizador decidir reinstalar com o utilizador admin.
