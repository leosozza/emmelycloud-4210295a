

# Analise Completa: Sistema de Agentes IA e Motor de Fluxos

## Arquitectura Geral

O sistema opera em 3 camadas:
1. **Webhooks** (whatsapp/instagram/bitrix24) recebem mensagens
2. **Flow Engine** decide: regra de negocio -> flow keyword -> flow all_messages -> fallback IA
3. **AI Process Message** executa ReACT loop com tools, RAG, sentiment, memoria

---

## BUGS CRITICOS ENCONTRADOS

### BUG 1: `wait_reply` nao tem handler (CRITICO)
O no `wait_reply` define `waiting_for_reply: true` no `bot_state` (linha 458), mas o switch principal do flow-engine (linhas 92-117) so verifica:
- `waiting_for_button`
- `waiting_for_input`
- `waiting_for_ai_intention`
- `force_flow_id`

**Resultado:** Quando um flow usa o no `wait_reply`, a conversa fica presa para sempre — a proxima mensagem do usuario nao e reconhecida como continuacao do flow e cai no matching normal ou fallback IA.

**Correcao:** Adicionar `else if (botState.waiting_for_reply)` no switch principal que resume o flow a partir do no seguinte.

### BUG 2: `integration_id` inexistente na query (MEDIO)
`matchFlow()` linha 232 faz `.eq("integration_id", conversation.integration_id)` na tabela `ai_agents`. A tabela `conversations` NAO tem coluna `integration_id` e `ai_agents` tambem nao. Resultado: a query do default_flow_id via agente nunca retorna resultados.

**Correcao:** Remover o `.eq("integration_id", ...)` — usar apenas `.eq("is_default", true)`.

### BUG 3: `base_prompt` nao e injectado no system prompt (MEDIO)
A tabela `ai_agents` tem `base_prompt` (persona do trainer), mas `ai-process-message` so usa `agent.system_prompt` (linha 420). O `base_prompt` gerado pelo Persona Trainer e completamente ignorado.

**Correcao:** Concatenar `(agent.base_prompt || "") + "\n" + (agent.system_prompt || "")` no system prompt.

### BUG 4: HITL skill matching por tipo errado (BAIXO)
Na linha 684, `skillMap.get(fnName)` procura pelo nome da tool (ex: `query_crm`), mas as skills sao guardadas com `skill_type` (ex: `crm`, `leads`). Os nomes nao coincidem, logo o HITL nunca dispara.

**Correcao:** Criar mapping de tool name -> skill_type, ou alterar o `SKILL_TYPES` no frontend para usar os mesmos nomes das tools.

---

## PROBLEMAS DE CONSISTENCIA

### P1: Skills UI vs Backend desalinhadas
O frontend (`AgentFormDialog.tsx` linha 18-26) define 7 skill types: `bitrix_crm`, `generate_proposal`, `generate_contract`, `create_payment`, `search_knowledge`, `run_flow`, `webhook`. O backend (`ai-process-message`) usa tools com nomes diferentes: `query_crm`, `check_payments`, `list_services`, `search_knowledge`, `navigate_graph`, `transfer_to_human`, `delegate_to_agent`. Nao ha mapping entre eles.

### P2: `navigate_graph` sempre disponivel
A tool `navigate_graph` e adicionada a TODOS os agentes (linha 488), independentemente de skills. Deveria depender de uma skill habilitada.

### P3: Governance mode "restricted" nao bloqueia delegation
Um agente `restricted` nao recebe tools (linha 578), mas o routing hierarquico e delegacao acontecem ANTES da verificacao de governance (linhas 244-253).

### P4: Custo de sub-agentes nao e contabilizado no budget
Quando `delegate_to_agent` invoca recursivamente o `ai-process-message`, o sub-agente verifica o SEU proprio budget, nao o do manager. Se o manager tem budget de $10 e delega a 5 sub-agentes, cada um pode gastar ate o seu proprio limite independentemente.

---

## OPORTUNIDADES DE MELHORIA

### M1: ReACT tool `create_lead` e `search_leads` duplicadas
Existem `query_crm` (entity=lead) E `search_leads`, ambas fazendo o mesmo. Consolidar.

### M2: Flow execution log incompleto
O `node_results` (linha 989) so grava `{ node_id }` sem o resultado ou duracoes por no. Deveria incluir `{ node_id, type, duration_ms, result }`.

### M3: Timeout de delegacao
`delegate_to_agent` nao tem timeout — se o sub-agente demorar, o manager fica preso.

---

## PLANO DE CORRECAO (4 items)

### 1. Corrigir handler `waiting_for_reply` no flow-engine
Adicionar ao switch principal (apos `waiting_for_ai_intention`):
```
else if (botState.waiting_for_reply) {
  // Resume flow from next node
  result = await handleWaitReplyResponse(...)
}
```
Criar funcao `handleWaitReplyResponse` que carrega o flow, salva `ultima_mensagem` nas variaveis, e continua execucao no no seguinte.

### 2. Corrigir `matchFlow` e injectar `base_prompt`
- Remover `.eq("integration_id", ...)` da query do default agent em `matchFlow`
- Concatenar `base_prompt` + `system_prompt` na construcao do system prompt no ai-process-message

### 3. Alinhar skill types UI/backend + corrigir HITL matching
- Criar mapping constante `TOOL_TO_SKILL` no ai-process-message:
  ```
  { query_crm: "crm", check_payments: "payments", list_services: "services", ... }
  ```
- Usar este mapping no HITL check em vez de `skillMap.get(fnName)`
- Actualizar `SKILL_TYPES` no frontend para corresponder as tools reais

### 4. Restricoes de governance e navigate_graph
- Mover `navigate_graph` para depender de uma skill `graph` ou `crm`
- Verificar governance mode ANTES do routing hierarquico

### Ficheiros a Alterar

| Ficheiro | Correcao |
|---|---|
| `supabase/functions/flow-engine/index.ts` | Handler `waiting_for_reply` + remover `integration_id` |
| `supabase/functions/ai-process-message/index.ts` | `base_prompt` injection + skill mapping HITL + `navigate_graph` condicional + governance check |
| `src/components/agentes/AgentFormDialog.tsx` | Alinhar `SKILL_TYPES` com tools reais |

