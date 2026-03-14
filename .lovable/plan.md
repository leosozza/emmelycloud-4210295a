

## Plano: Selector de Agente no IM Sidebar

### Objectivo

Adicionar ao IM Sidebar (`bitrix24-im-sidebar`) um dropdown para escolher qual agente IA será consultado, carregando a lista de agentes activos da tabela `ai_agents`.

### Implementação em `supabase/functions/bitrix24-im-sidebar/index.ts`

1. **Dropdown de agente** no header ou context bar — select estilizado com lista de agentes
2. **Carregar agentes** no init via fetch REST: `SUPABASE_URL/rest/v1/ai_agents?is_active=eq.true&select=id,name` com header `apikey`
3. **Passar `agent_id`** ao enviar mensagem — em vez de chamar `ai-process-message`, chamar `ai-playground` com `agent_id` e `messages` (array de conversationHistory)
4. **Fallback**: se nenhum agente seleccionado, usar `ai-process-message` como está (comportamento actual)
5. **Persistir selecção** em `localStorage` para manter o agente entre recarregamentos

### Layout actualizado

```text
┌──────────────────────────────┐
│ 🤖 Emmely AI  [▼ Agente X ] │  ← dropdown no header
├──────────────────────────────┤
│ Chat: dialog123              │
├──────────────────────────────┤
│ Mensagens...                 │
├──────────────────────────────┤
│ [Resumir] [Procedimento]...  │
├──────────────────────────────┤
│ [textarea]            [Send] │
└──────────────────────────────┘
```

### Alterações CSS

- Adicionar `.agent-select` styled select dentro do header (fundo semi-transparente, texto branco)

### Ficheiro a modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/bitrix24-im-sidebar/index.ts` | Adicionar fetch de agentes, dropdown, e lógica de routing para `ai-playground` |

