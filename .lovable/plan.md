

# Restaurar Sidebar — Portal e iframe Bitrix24

## Situação Atual
- **Portal principal** (`AppLayout.tsx`): Usa `Dock` (barra inferior tipo macOS) para navegação
- **Iframe Bitrix24** (`Bitrix24App.tsx`): Usa `ExpandableTabs` no header para navegação
- O componente `AppSidebar.tsx` já existe com toda a navegação organizada por grupos mas não está a ser usado

## Plano

### 1. Portal Principal — Restaurar Sidebar
**Ficheiro:** `src/components/AppLayout.tsx`

- Remover o `Dock` e `AppDock`
- Envolver o layout com `SidebarProvider` do shadcn
- Usar o `AppSidebar` existente como sidebar lateral
- Adicionar `SidebarTrigger` no header para toggle
- Layout: sidebar à esquerda, header + conteúdo à direita

```text
┌──────────┬──────────────────────────┐
│          │  Header + SidebarTrigger │
│ Sidebar  ├──────────────────────────┤
│          │  <Outlet />              │
│          │                          │
└──────────┴──────────────────────────┘
```

### 2. Iframe Bitrix24 — Adicionar Sidebar
**Ficheiro:** `src/pages/Bitrix24App.tsx`

- Remover o `ExpandableTabs` do header
- Criar sidebar compacta com os mesmos `navCategories` já definidos
- Usar o componente `AnimatedSidebar` já existente (hover-expand) para manter o iframe compacto
- Header simplificado: logo + domain badge + status (sem tabs)
- Layout: sidebar colapsável à esquerda, conteúdo à direita

```text
┌────┬──────────────────────────────┐
│ 🔘 │  Logo  Domain       Status  │
│ 🔘 ├──────────────────────────────┤
│ 🔘 │  View content               │
│ 🔘 │                              │
│    │                              │
└────┴──────────────────────────────┘
```

### Ficheiros a editar
1. `src/components/AppLayout.tsx` — sidebar + remover dock
2. `src/pages/Bitrix24App.tsx` — sidebar + remover ExpandableTabs

