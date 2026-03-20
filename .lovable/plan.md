

# Sidebar como Overlay (sem empurrar conteúdo)

## Problema
A `AnimatedSidebar` atual (DesktopSidebar) ocupa espaço no layout (`shrink-0`), fazendo o conteúdo redimensionar ao expandir/colapsar.

## Solução
Alterar o `DesktopSidebar` em `AnimatedSidebar.tsx` para usar `position: fixed` (overlay), ficando por cima do conteúdo sem o deslocar. A sidebar abre ao hover e fecha ao sair, como um painel flutuante.

### Alterações

**Ficheiro:** `src/components/bitrix24/AnimatedSidebar.tsx` — `DesktopSidebar`

- Mudar de `shrink-0` para `fixed left-0 top-0 z-40` com `h-full`
- Remover o espaço reservado no layout — a sidebar fica sobreposta
- Adicionar sombra (`shadow-xl`) quando expandida para destacar do conteúdo
- Manter o comportamento hover-expand existente

**Ficheiro:** `src/pages/Bitrix24App.tsx`

- O `<main>` deixa de precisar compensar a largura da sidebar — ocupa 100% da largura
- Remover o wrapper `flex` que faz sidebar + main lado a lado; main fica full-width

### Resultado visual
```text
┌──────────────────────────────────┐
│  Main content (100% width)       │
│                                  │
│ ┌──┐                             │
│ │🔘│  ← sidebar colapsada (60px) │
│ │🔘│    sobreposta ao conteúdo   │
│ │🔘│                             │
│ └──┘                             │
│                                  │
└──────────────────────────────────┘

Hover → sidebar expande por cima como modal overlay
```

### Ficheiros a editar
1. `src/components/bitrix24/AnimatedSidebar.tsx` — DesktopSidebar fixed overlay
2. `src/pages/Bitrix24App.tsx` — layout full-width sem flex sidebar

