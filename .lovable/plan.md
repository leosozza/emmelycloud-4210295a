
# Plano: Drag & Drop no Funil Kanban de Leads

## Resumo

Adicionar funcionalidade de arrastar e soltar (drag & drop) ao funil Kanban, permitindo mover leads entre estagios visuais. Ao soltar um card numa nova coluna, o estagio e atualizado automaticamente na base de dados.

## Abordagem

Utilizar a **HTML Drag and Drop API nativa** (sem dependencias externas), que e leve e suficiente para este caso. Cada card sera "draggable" e cada coluna sera uma "drop zone".

## Alteracoes

### 1. `src/components/leads/LeadKanbanBoard.tsx`

Refatorar para suportar drag & drop:

- Adicionar prop `onMoveStage(leadId, newStage)` para comunicar mudancas ao componente pai
- Cada coluna (`div` do estagio) recebe handlers `onDragOver` e `onDrop`
- Ao soltar, extrai o `leadId` do `dataTransfer` e chama `onMoveStage`
- Adicionar visual de "drop zone ativa" (borda azul/highlight) quando um card esta a ser arrastado sobre a coluna
- Estado local `dragOverStage` para controlar qual coluna esta highlighted

### 2. `src/components/leads/LeadCard.tsx`

Tornar o card arrastavel:

- Adicionar `draggable` ao `div` principal
- Handler `onDragStart` que guarda o `lead.id` no `dataTransfer`
- Estilo visual durante arraste (opacidade reduzida)
- Prevenir que o click do card abra a ficha lateral durante o arraste

### 3. `src/pages/Leads.tsx`

Passar o callback `onMoveStage` ao `LeadKanbanBoard`:

- Reutilizar a `moveStageMutation` existente
- A prop sera `onMoveStage={(leadId, stage) => moveStageMutation.mutate({ id: leadId, stage })}`

## Detalhes Tecnicos

- **Zero dependencias novas**: usa apenas a API nativa `draggable`, `onDragStart`, `onDragOver`, `onDrop`
- **Optimistic update**: ao soltar, atualiza o cache do React Query localmente antes da resposta do servidor para feedback imediato
- **Ficheiros editados**: `LeadKanbanBoard.tsx`, `LeadCard.tsx`, `Leads.tsx`
- **Sem alteracoes de base de dados**: reutiliza a mutation existente que faz `update` no `funnel_stage`
