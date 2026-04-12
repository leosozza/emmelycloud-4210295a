

# Pretext Canvas Layout — Expansao para Toda a Aplicacao

## Contexto

O `src/lib/messageLayout.ts` ja implementa medicao de texto via Canvas 2D (sem DOM reflows) para o chat WhatsApp. O objectivo e expandir esta tecnica para **todas as areas da aplicacao** que fazem scroll de listas longas, auto-resize de textareas, ou renderizacao de texto em tabelas/cards.

## Areas Identificadas para Optimizacao

### 1. ChatIA + PlaygroundIA — Virtualizacao de Chat (ALTO IMPACTO)
Ambas as paginas (`ChatIA.tsx`, `PlaygroundIA.tsx`) renderizam todas as mensagens no DOM e usam `scrollHeight` para auto-scroll. Com sessoes longas, sofrem os mesmos problemas do chat WhatsApp.

**Alteracoes:**
- Criar `src/lib/chatLayout.ts` — versao simplificada do `messageLayout.ts` para mensagens `{role, content}` (sem media, sem source labels)
- Virtualizar ambas as listas com `@tanstack/react-virtual` + alturas pre-calculadas
- Eliminar `scrollRef.current.scrollHeight` — usar `scrollToIndex(last)` do virtualizer

### 2. ConversationList — Virtualizacao da Lista de Conversas (ALTO IMPACTO)
A lista de conversas (259 linhas) renderiza todas as conversas no DOM via `ScrollArea`. Com 500+ conversas activas, isto e lento.

**Alteracoes:**
- Virtualizar a lista com `useVirtualizer`, cada item tem altura fixa (~70px)
- Manter filtros e search como estao (filtram antes de virtualizar)

### 3. Tabelas Longas — LeadListView, Clientes, Casos, Financeiro (MEDIO IMPACTO)
Multiplas paginas usam `<Table>` com `.map()` sem paginacao nem virtualizacao. Com centenas de registos, o DOM fica pesado.

**Alteracoes:**
- Criar componente `src/components/ui/VirtualTable.tsx` reutilizavel que usa `useVirtualizer` para renderizar so as linhas visiveis
- Aplicar em `LeadListView.tsx`, `Clientes.tsx`, `Casos.tsx`

### 4. Simulation Chat — Multi-party Chat View (MEDIO IMPACTO)
`Simulation.tsx` renderiza mensagens de simulacao sem virtualizacao.

**Alteracoes:**
- Reutilizar o mesmo pattern de virtualizacao do ChatIA

### 5. Kanban Board — Layout Pre-calculado (BAIXO IMPACTO)
O `LeadKanbanBoard.tsx` renderiza todos os cards em todas as colunas. Com muitos leads por coluna, pode beneficiar de virtualizacao vertical por coluna.

**Alteracoes:**
- Virtualizar cada coluna do kanban independentemente

### 6. Textareas Globais — Reflow-free Resize (BAIXO IMPACTO)
O `calcTextareaHeight` ja existe mas so e usado no `ChatInput.tsx`. Outros textareas na app (PropostaForm, CasoForm, etc.) usam resize nativo ou nao fazem auto-resize.

**Alteracoes:**
- Criar hook `useCanvasAutoResize(ref, text, width)` que aplica `calcTextareaHeight` genericamente
- Opcionalmente integrar nos formularios principais

---

## Ficheiros a Alterar/Criar

| Ficheiro | Accao |
|---|---|
| `src/lib/chatLayout.ts` | **Novo** — layout pre-calculado para chats simples (role/content) |
| `src/components/ui/VirtualTable.tsx` | **Novo** — tabela virtualizada reutilizavel |
| `src/hooks/useCanvasAutoResize.ts` | **Novo** — hook generico para textarea auto-resize sem reflow |
| `src/pages/ChatIA.tsx` | Virtualizar lista de mensagens |
| `src/pages/PlaygroundIA.tsx` | Virtualizar lista de mensagens |
| `src/components/atendimento/ConversationList.tsx` | Virtualizar lista de conversas |
| `src/components/leads/LeadListView.tsx` | Usar VirtualTable |
| `src/pages/Clientes.tsx` | Usar VirtualTable |
| `src/pages/Casos.tsx` | Usar VirtualTable |
| `src/pages/Simulation.tsx` | Virtualizar chat de simulacao |
| `src/components/leads/LeadKanbanBoard.tsx` | Virtualizar colunas |

### Prioridade
1. **ChatIA + PlaygroundIA** — impacto imediato, pattern ja provado no WhatsApp
2. **ConversationList** — lista mais usada da app
3. **VirtualTable + tabelas** — componente reutilizavel que beneficia multiplas paginas
4. **Simulation + Kanban + Textareas** — refinamentos incrementais

