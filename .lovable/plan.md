

## Auditoria Completa: Pipeline de Agentes IA

### Problemas Identificados

Encontrei **5 problemas criticos** na ligacao entre a criacao de agentes e a sua execucao no backend.

---

### BUG 1: Vinculo do treinamento esta partido (CRITICO)

O formulario de agente guarda `training_collection_ids` (IDs de documentos) directamente na tabela `ai_agents`. Porem, o backend (`ai-process-message` e `ai-playground`) leem a tabela **`agent_knowledge_documents`** (tabela N:N) para buscar os chunks de conhecimento.

**Resultado**: Os documentos de treinamento selecionados no formulario **nunca chegam ao agente** porque ninguem popula a tabela `agent_knowledge_documents`.

**Correcao**: No `handleSave` de `Agentes.tsx`, apos guardar o agente, sincronizar a tabela `agent_knowledge_documents`:
- Apagar registos existentes para o `agent_id`
- Inserir um registo por cada ID em `training_collection_ids`

---

### BUG 2: `ai-process-message` nao resolve URL para providers locais (Qwen/Ollama)

O `ai-playground` tem logica para buscar `OLLAMA_BASE_URL` da tabela `integration_credentials` quando `credential_key === "base_url"`. O `ai-process-message` **nao tem essa logica** — apenas faz `agent.ai_base_url || provider?.base_url`, que pode estar vazio para providers locais.

**Resultado**: Agentes configurados com Qwen/Ollama funcionam no Playground (ChatIA) mas **falham no atendimento automatico** (chatbot-reply/flow-engine).

**Correcao**: Alinhar a logica de resolucao de URL e auth em `ai-process-message` com a do `ai-playground`:
- Adicionar verificacao de `credential_key === "base_url"`
- Buscar `OLLAMA_BASE_URL` de `integration_credentials`
- Respeitar `auth_header` nulo (Ollama nao usa auth)

---

### BUG 3: `ai-process-message` nao respeita `training_collection_ids` (campo do agente)

Mesmo depois de corrigir o Bug 1, o `ai-process-message` busca KB via `agent_knowledge_documents`, o que esta correcto. Mas existe uma inconsistencia: o agente tem dois mecanismos de vinculo (campo array `training_collection_ids` e tabela N:N `agent_knowledge_documents`). Devemos usar apenas um: a tabela N:N, que e o que o backend le.

**Correcao**: Manter o campo `training_collection_ids` como UI-only e sincronizar com `agent_knowledge_documents` no save (ja coberto pelo Bug 1).

---

### BUG 4: Fluxo padrao do agente nao e verificado no `ai-process-message`

Quando uma mensagem chega via `ai-process-message` (caminho directo, sem passar pelo `flow-engine`), o `default_flow_id` do agente e **completamente ignorado**. O agente simplesmente responde com IA livre.

O `flow-engine` verifica o `default_flow_id` apenas no `matchFlow`, mas se a mensagem for encaminhada directamente para `ai-process-message` (ex: via `chatbot-reply`), o fluxo nunca e executado.

**Resultado**: Um agente com fluxo vinculado ignora o fluxo quando chamado via `chatbot-reply`.

**Correcao**: Modificar `chatbot-reply` para chamar `flow-engine` em vez de `ai-playground` directamente. O `flow-engine` ja faz fallback para `ai-process-message` quando nenhum fluxo corresponde. Pipeline correcto:

```text
Webhook → flow-engine → (match flow? execute : fallback → ai-process-message)
```

Actualmente `chatbot-reply` faz:
```text
Webhook → chatbot-reply → ai-playground (ignora fluxos)
```

---

### BUG 5: Docs listados no formulario sao documentos individuais, nao colecoes

O formulario carrega `knowledge_documents` e mostra cada documento individual. Mas o sistema de treinamento organiza por **colecoes** (`collection_id`). Quando um utilizador cria um treinamento "Metodo Prime" com 7 ficheiros, aparecem 7+ documentos individuais no selector (incluindo o resumo auto-gerado), em vez de 1 colecao.

**Correcao**: Agrupar por `collection_id` no formulario. Carregar colecoes distintas em vez de documentos individuais. Quando uma colecao e selecionada, vincular todos os documentos dessa colecao.

---

### Plano de Correcao

| # | Ficheiro | Alteracao |
|---|---|---|
| 1 | `src/pages/Agentes.tsx` | No `handleSave`, sincronizar `agent_knowledge_documents` apos save |
| 2 | `src/pages/Agentes.tsx` | Carregar colecoes (distinct `collection_id`/`collection_name`) em vez de docs individuais |
| 3 | `src/components/agentes/AgentFormDialog.tsx` | Mostrar colecoes agrupadas no selector de KB |
| 4 | `supabase/functions/ai-process-message/index.ts` | Alinhar logica de provider (URL + auth) com `ai-playground` |
| 5 | `supabase/functions/chatbot-reply/index.ts` | Chamar `flow-engine` em vez de `ai-playground` para respeitar fluxos |

### Detalhes tecnicos

**Sincronizacao de KB (Bug 1)**:
```
// Apos save do agente:
await supabase.from("agent_knowledge_documents").delete().eq("agent_id", agentId);
// Para cada collection_id selecionado, buscar os document_ids e inserir
const { data: collectionDocs } = await supabase
  .from("knowledge_documents")
  .select("id")
  .in("collection_id", training_collection_ids);
await supabase.from("agent_knowledge_documents").insert(
  collectionDocs.map(d => ({ agent_id: agentId, document_id: d.id }))
);
```

**chatbot-reply corrigido (Bug 4)**:
Substituir a chamada a `ai-playground` por chamada a `flow-engine`. O flow-engine ja faz: match de fluxo → execucao → fallback para ai-process-message. Isto garante que o `default_flow_id` do agente e respeitado.

Nenhuma migracao de BD necessaria. Todos os bugs sao corrigidos com alteracoes de codigo.

