

# Igualar /bitrix24/agentes a /agentes

## Problema
A vista de agentes dentro do Bitrix24 (`AgentesView` no `Bitrix24App.tsx`, linhas 1209-1419) é uma versão simplificada que não usa o componente `AgentCard` nem tem os mesmos recursos da página principal `/agentes`.

**Funcionalidades em falta no Bitrix24:**
- Componente `AgentCard` (usa cards inline simplificados)
- Botão "Criar com IA" (AgentBuilderChat)
- Botão "Sincronizar Bots Bitrix24"
- Duplicar agente
- Treinar agente (botão Sparkles no card)
- Badge do Bot Bitrix24 no card
- Confirmação de eliminação (usa `confirm()` nativo)
- Skills (toggle de skills na edição)
- Sync de `agent_knowledge_documents`

## Solução
Refactorizar `AgentesView` para reutilizar os mesmos componentes e lógica da página `/agentes`, adaptando apenas o header ao estilo Bitrix24.

### `src/pages/Bitrix24App.tsx` — `AgentesView`

1. **Importar** `AgentCard`, `AgentBuilderChat`, `AlertDialog` (já importados parcialmente)
2. **Substituir os cards inline** (linhas 1353-1401) por `<AgentCard>` — o mesmo componente usado em `/agentes`
3. **Adicionar** estados e handlers em falta:
   - `builderOpen` + `AgentBuilderChat`
   - `deleteId` + `AlertDialog` de confirmação
   - `duplicateAgent()`
   - `syncBitrixBots()`
   - `syncKnowledgeDocuments()`
   - `skills` + `handleSkillToggle()`
4. **Adicionar botões no header**:
   - "Sincronizar Bots Bitrix24" (se integração existe)
   - "Criar com IA"
   - "Novo Agente"
5. **Passar `skills` e `onSkillToggle`** ao `AgentFormDialog`
6. **Remover** o código inline dos cards e handlers simplificados (`handleToggleActive`, `handleRepublishBot`, `handleSetDefault` inline) — substituídos pela lógica do `AgentCard`
7. **Usar grid** `md:grid-cols-2 lg:grid-cols-3` como na página principal

### Ficheiro a alterar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Reescrever `AgentesView` (~linhas 1209-1419) para reutilizar `AgentCard`, `AgentBuilderChat`, e toda a lógica de `/agentes` |

