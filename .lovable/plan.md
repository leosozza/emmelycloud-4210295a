

## Integrar sidebar animada (Aceternity-style) no Bitrix24App

### Resumo

Substituir a sidebar estatica actual do `/bitrix24` por uma sidebar animada com hover-to-expand, usando framer-motion. A sidebar colapsa para mostrar apenas icones e expande ao passar o rato, seguindo o padrao Aceternity UI.

### Dependencia nova

- `framer-motion` - necessario para as animacoes de expand/collapse

### Novos ficheiros

| Ficheiro | Descricao |
|---|---|
| `src/components/bitrix24/AnimatedSidebar.tsx` | Sidebar animada adaptada para React (sem Next.js). Inclui SidebarProvider, SidebarBody, DesktopSidebar, MobileSidebar e SidebarLink adaptados para navegacao por estado (onClick + setView) em vez de rotas |

**Nota**: NAO vou sobrescrever `src/components/ui/sidebar.tsx` que ja existe e e o sidebar shadcn usado no resto da app. O componente Aceternity sera criado separadamente em `src/components/bitrix24/`.

### Adaptacoes do componente original

O componente fornecido usa Next.js (`Link`, `Image`) e precisa de adaptacao:

- `Link` do Next.js sera substituido por `<button>` com `onClick` (a navegacao do Bitrix24App e baseada em estado, nao em rotas)
- `Image` do Next.js sera substituido por `<img>` standard
- O `SidebarLink` sera adaptado para aceitar `onClick` e `isActive` em vez de `href`
- A interface `Links` sera estendida com `id` para mapear ao `AppView`

### Ficheiro a editar

**`src/pages/Bitrix24App.tsx`** (linhas 202-267 - sidebar actual):

- Importar `AnimatedSidebar` e os sub-componentes
- Substituir o `<aside>` estatico pelo novo componente animado
- Manter o header com logo gradient, as categorias de navegacao (Emmely IO, Emmely CRM, Emmely Pay), e o footer com status de conexao
- A sidebar ira:
  - Mostrar apenas icones quando colapsada (hover out)
  - Expandir suavemente ao hover mostrando labels
  - No mobile, usar um menu hamburger com overlay

### Estrutura visual

```text
Colapsada (w-14)     Expandida (w-56, on hover)
+------+             +------------------------+
| [E]  |             | [E] Emmely Cloud       |
+------+             |      for Bitrix24      |
| [*]  |    hover    |      domain.com        |
| [B]  |   ------>   +------------------------+
| [B]  |             | EMMELY IO              |
| [P]  |             |  * Chat IA             |
+------+             |  B Persona             |
| [.]  |             |  B Treinamento         |
+------+             |  P Playground          |
                     | EMMELY CRM             |
                     |  ...                   |
                     +------------------------+
                     | . Conectado            |
                     +------------------------+
```

### Detalhes tecnicos

- `framer-motion` `animate` prop controla a largura: `w-14` (60px) colapsado, `w-56` (224px) expandido
- `AnimatePresence` para mostrar/esconder labels com fade
- `motion.span` para animar o texto dos links com opacity e display
- Estado `open` controlado por `onMouseEnter`/`onMouseLeave` no desktop
- Mobile: botao hamburger com overlay fullscreen animado
- As categorias de navegacao continuam a usar `Collapsible` quando expandido, e mostram apenas o icone quando colapsado
