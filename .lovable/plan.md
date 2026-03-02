

## Trocar Sidebar Lateral por Menu Superior no Bitrix24

O iframe Bitrix24 atualmente usa uma sidebar animada lateral (`AnimatedSidebar`). Vamos substituir por um menu horizontal superior usando o componente `ExpandableTabs` (framer-motion + usehooks-ts).

### Ficheiros a Criar

**1. `src/components/ui/expandable-tabs.tsx`**
- Copiar o componente ExpandableTabs conforme fornecido
- Dependencia nova: `usehooks-ts` (precisa instalar)

### Ficheiros a Editar

**2. `src/pages/Bitrix24App.tsx`**
- Remover imports de `AnimatedSidebar`, `AnimatedSidebarBody`, `AnimatedSidebarLink`, `useAnimatedSidebar`
- Remover `SidebarInner` component e todo o bloco `<AnimatedSidebar>` no return
- Substituir layout `flex` (sidebar + main) por layout `flex-col` (header + main)
- Criar header com:
  - Logo "E" + "Emmely Cloud for Bitrix24" + dominio badge (esquerda)
  - `ExpandableTabs` com os 9 items de navegacao das 3 categorias, usando separators entre categorias (centro)
  - Status (conectado/desconectado) + Bot ID (direita)
- Tabs array:
  ```
  [Chat IA, Persona, Treinamento, Playground] | separator | [Dashboard, Fluxos, Mapeamento] | separator | [Pagamentos, Relatórios]
  ```
- `onChange` do ExpandableTabs mapeia o index para o `setView()` correspondente
- Main content permanece igual, apenas sem sidebar ao lado

### Estrutura Final

```text
┌──────────────────────────────────────────────────┐
│ [E] Emmely Cloud  [tabs expandiveis...]  ● Online│  ← header fixo
├──────────────────────────────────────────────────┤
│                                                  │
│              View content (igual)                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Dependencia NPM
- `usehooks-ts` — necessaria para `useOnClickOutside` no ExpandableTabs

