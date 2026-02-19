
# Diagnóstico Definitivo + Plano por Fases

## O Problema Real (Após Leitura Completa do Thothai)

Após ler CADA ficheiro do thothai e comparar com o nosso sistema, encontrei **3 diferenças críticas** que impedem o bot de funcionar:

---

### PROBLEMA 1: O bot_id NUNCA é guardado na base de dados

Os logs mostram que o bot foi registado com ID `10265`, mas a tabela `bitrix24_integrations` tem:
- `bitrix_agent_id = NULL`
- `config = { "installed_at": "...", "auth_payload": {} }`
- **`bot_id NÃO ESTÁ no config!`**

**Por quê?** O código actual faz `update` com `config: { installed_at, bot_id }`, mas no momento da instalação o campo `config` já tem `{ installed_at, auth_payload }` e o update **sobrescreve sem fazer merge** com o auth_payload existente. O bot_id é salvo mas num campo diferente do que o worker procura.

**O worker procura:** `integration.config.bot_id` — mas o campo config está assim: `{ installed_at: "...", auth_payload: {} }` — **sem bot_id**.

---

### PROBLEMA 2: A tabela bitrix_event_queue nunca recebe eventos

Os logs da DB mostram que a `bitrix_event_queue` está **vazia** (0 registos). Isso significa que os eventos do Bitrix24 não estão a chegar à função `bitrix24-events`, OU estão a chegar mas a falhar antes do INSERT. 

**Por quê?** O `bitrix24-events` tem a coluna `member_id` no INSERT mas o payload do Bitrix24 pode não ter `member_id` explícito no evento `ONIMBOTMESSAGEADD` — ele vem dentro de `auth.member_id` ou `data.PARAMS`.

**O thothai não guarda `member_id` no insert da queue** — apenas guarda `event_type`, `payload`, e `status`. A nossa tabela tem a coluna `member_id` mas o worker a vai buscar depois com `.eq("member_id", event.member_id)`. Se o `member_id` não for guardado no insert, o worker não encontra a integração!

---

### PROBLEMA 3: A função `bitrix24-install` retorna HTML em vez de texto simples

O thothai, quando recebe `ONAPPINSTALL`, retorna HTML com `BX24.installFinish()`. O nosso sistema retorna um redirect para `/bitrix24`. O problema é que o Bitrix24 **não chama** `BX24.installFinish()` e a instalação fica incompleta — os event bindings podem não estar ativos.

---

### PROBLEMA 4 (Thothai usa função separada): `ai-process-bitrix24` vs `ai-process-message`

O thothai tem uma função dedicada `ai-process-bitrix24` que:
1. Usa `imbot.message.add` com BOT_ID para responder
2. Gere histórico de conversa específico para o contexto Bitrix24
3. Tem anti-loop (lock de processamento)

O nosso `ai-process-message` foi desenhado para WhatsApp/Instagram e usa `skip_send: true` — o worker tenta responder, mas a função retorna o texto sem enviar nada, e o worker faz o envio. **Isso está correto na nossa arquitetura**, mas precisa de garantir que o BOT_ID está disponível.

---

## Arquitetura Correcta (Baseada no Thothai)

```text
FASE 1: Fix Instalação
bitrix24-install
  ├── Registar bot com TYPE:"H"  ✅ (já feito)
  ├── Guardar bot_id em config E bitrix_agent_id  ❌ (bug: não faz merge)
  └── Retornar HTML com BX24.installFinish()  ❌ (falta)

FASE 2: Fix Events
bitrix24-events
  ├── Parsear payload PHP-style  ✅ (feito)
  ├── Extrair member_id corretamente  ⚠️ (pode falhar)
  ├── INSERT com member_id correto  ❌ (pode ser null)
  └── Trigger worker  ✅ (feito)

FASE 3: Fix Worker
bitrix24-worker
  ├── Buscar integration por member_id  ✅ (feito)
  ├── Obter bot_id de config  ❌ (não está no config)
  ├── Extrair dialogId de data.PARAMS  ✅ (feito)
  └── Chamar imbot.message.add com BOT_ID  ✅ (feito)
```

---

## Plano por Fases

### FASE 1 — Corrigir a Instalação (Fix crítico do bot_id)

**Ficheiro:** `supabase/functions/bitrix24-install/index.ts`

**Problema:** O update do `config` sobrescreve em vez de fazer merge. O campo `config` fica sem `bot_id`.

**Fix:**
```typescript
// ANTES (errado - sobrescreve tudo):
config: {
  installed_at: new Date().toISOString(),
  bot_id: finalBotId,
}

// DEPOIS (correto - merge com config existente):
// 1. Primeiro buscar o config actual
const { data: currentInt } = await supabase
  .from("bitrix24_integrations")
  .select("config")
  .eq("id", integrationId)
  .single();

// 2. Fazer merge
const currentConfig = currentInt?.config || {};
await supabase.from("bitrix24_integrations").update({
  bitrix_agent_id: finalBotId,
  config: {
    ...currentConfig,   // preservar installed_at, auth_payload, etc.
    bot_id: finalBotId,
    bot_registered_at: new Date().toISOString(),
  },
}).eq("id", integrationId);
```

**Também adicionar:** A resposta HTML com `BX24.installFinish()` (copiado do thothai) para garantir que a instalação fica completa no Bitrix24.

**Também adicionar:** Binding do evento `OnImbotMessageAdd` (com maiúsculas como o Bitrix24 espera) para que os eventos do bot cheguem ao `bitrix24-events`.

---

### FASE 2 — Corrigir o Events Handler (Fix do member_id na queue)

**Ficheiro:** `supabase/functions/bitrix24-events/index.ts`

**Problema:** O `member_id` pode não ser extraído correctamente do payload, resultando em `member_id: null` na queue, e o worker não consegue encontrar a integração.

**Fix:**
```typescript
// Extrair member_id de múltiplas fontes (como o thothai faz)
const memberId = 
  payload.auth?.member_id ||
  payload.member_id ||
  payload.data?.auth?.member_id ||
  payload.data?.PARAMS?.member_id ||
  null;

// Inserir com member_id correctamente
await supabase.from("bitrix_event_queue").insert({
  event_type: event,
  payload: payload,
  member_id: memberId,  // CRÍTICO para o worker encontrar a integração
  status: "pending"
});
```

**Também adicionar:** Logging detalhado (como o thothai) para poder ver o payload completo nos logs da função.

---

### FASE 3 — Corrigir o Worker (Fallback para bot_id)

**Ficheiro:** `supabase/functions/bitrix24-worker/index.ts`

**Problema:** O worker procura `integration.config.bot_id` mas esse campo não está guardado (problema da Fase 1). Também precisa de fallback para `integration.bitrix_agent_id`.

**Fix — adicionar múltiplos fallbacks para bot_id:**
```typescript
const configData = integration.config as any || {};

// Tentar obter bot_id de múltiplas fontes:
const botId = 
  configData.bot_id ||                    // config.bot_id (depois do fix da Fase 1)
  integration.bitrix_agent_id ||           // coluna directa (depois do fix da Fase 1)
  params.BOT_ID ||                         // payload do evento (Bitrix24 envia isto)
  botIdFromPayload ||
  null;
```

**Também adicionar:** Para o evento `ONIMBOTMESSAGEADD`, o Bitrix24 envia o `BOT_ID` no próprio payload — isso deve ser sempre usado como fallback mesmo que o config não tenha o bot_id.

---

### FASE 4 — Criar Edge Function `ai-process-bitrix24` (dedicada ao bot Bitrix24)

**Ficheiro:** `supabase/functions/ai-process-bitrix24/index.ts` (novo)

Esta é a **diferença mais importante** do thothai: ele tem uma função de IA dedicada ao contexto Bitrix24 que:

1. Recebe `{ bitrix24_dialog_id, bitrix24_bot_id, content, integration_id, ... }`
2. Busca o agente IA configurado
3. Chama o modelo de IA (Gemini/GPT)
4. Responde diretamente via `imbot.message.add` com o BOT_ID
5. Salva o histórico de conversa associado ao `dialog_id`

**O nosso worker actual** chama `ai-process-message` com `skip_send: true` e depois faz `imbot.message.add` separado. Isso funciona, mas é frágil. A abordagem do thothai é mais robusta porque o envio e o processamento ficam na mesma função.

No entanto, para não fazer demasiadas mudanças de uma vez, podemos manter a abordagem actual do worker mas garantindo que o bot_id está disponível (Fase 3).

---

### FASE 5 — Corrigir a UI do Painel Bitrix24 (/bitrix24)

Baseado nas screenshots do thothai, o painel dentro do Bitrix24 deve ter:
- **Dashboard** com status de conexão
- **Instâncias** (configuração de canais)
- **Personas/Agentes** com indicador "Bot Ativo"
- Botão "Republicar" para re-registar o bot

Atualmente o nosso `/bitrix24` tem uma interface com tabs mas sem visibilidade do estado do bot.

---

## Ordem de Execução

```text
Fase 1 → Deploy → Reinstalar app no Bitrix24
                     ↓
Fase 2 → Deploy → Verificar logs da bitrix_event_queue
                     ↓
Fase 3 → Deploy → Testar envio de mensagem ao bot
                     ↓
Verificar se o bot responde no Bitrix24
                     ↓
Fase 4 (se necessário) → Criar ai-process-bitrix24 dedicada
                     ↓
Fase 5 → Melhorar UI do painel
```

---

## Ficheiros a Editar

1. **`supabase/functions/bitrix24-install/index.ts`** — Fix do merge do config + HTML com BX24.installFinish() + binding correto de OnImbotMessageAdd
2. **`supabase/functions/bitrix24-events/index.ts`** — Fix da extração do member_id + logging detalhado
3. **`supabase/functions/bitrix24-worker/index.ts`** — Fix dos fallbacks do bot_id + usar BOT_ID do payload sempre que disponível
4. **`supabase/functions/ai-process-bitrix24/index.ts`** *(novo)* — Função dedicada ao processamento IA no contexto Bitrix24 (Fase 4)

## Resultado Esperado Após Implementação

Após o deploy e reinstalação da app no Bitrix24:
- O bot "Emmely AI" aparece nos Contactos do Bitrix24
- Ao escrever ao bot, o evento chega à `bitrix_event_queue` com `member_id` correto
- O worker processa o evento, encontra o `bot_id` (do payload OU do config)
- A IA gera uma resposta e o bot responde via `imbot.message.add`
- A mensagem aparece no chat do Bitrix24
