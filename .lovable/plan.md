

# Corrigir: Botão "Ativar no Bitrix24" não tem efeito no worker

## Problema
O botão "Ativar no Bitrix24" no card do agente salva `bitrix_agent_id` na tabela `bitrix24_integrations`, mas o `bitrix24-worker` nunca lê este campo. As funções `handleBotMessage` e `handleWelcome` sempre buscam o agente por `is_default: true` ou qualquer agente ativo, ignorando a escolha do utilizador.

O bot "Emmely AI" é único (registado via `imbot.register`) — o que muda é **qual agente IA** responde por trás dele.

## Correção

### `supabase/functions/bitrix24-worker/index.ts`

**`handleBotMessage` (~linha 440-455):**
Alterar a lógica de seleção do agente:
1. Se `integration.bitrix_agent_id` existe → buscar esse agente específico
2. Fallback para `is_default: true`
3. Fallback para qualquer agente ativo

```
// Prioridade: bitrix_agent_id > is_default > qualquer ativo
let agent = null;
if (integration.bitrix_agent_id) {
  const { data } = await supabase.from("ai_agents").select("id, welcome_message")
    .eq("id", integration.bitrix_agent_id).eq("is_active", true).maybeSingle();
  agent = data;
}
if (!agent) { /* fallback is_default */ }
if (!agent) { /* fallback any active */ }
```

**`handleWelcome` (~linha 508-517):**
Mesma lógica — usar `integration.bitrix_agent_id` para buscar a `welcome_message` do agente correto.

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-worker/index.ts` | `handleBotMessage` e `handleWelcome`: priorizar `integration.bitrix_agent_id` na seleção do agente |

Sem alterações na UI — o botão e a base de dados já funcionam correctamente. O problema é apenas no worker que não usa o valor guardado.

