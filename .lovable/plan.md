

## Plano: Melhorar Apresentação Visual dos Ícones

### Diagnóstico

Os ícones usam lucide-react (biblioteca profissional), mas a apresentação visual é inconsistente:

1. **Sidebar**: ícones a `h-4 w-4` (16px) sem container — parecem pequenos e "soltos"
2. **KPI Cards**: container `bg-primary/8` muito subtil, ícone a `h-4.5 w-4.5` (tamanho não-standard do Tailwind)
3. **Header**: ícones sem tratamento visual uniforme
4. **Dashboard**: mistura de tamanhos e estilos sem padrão

### Solução

Padronizar todos os ícones com `strokeWidth={1.5}` (mais elegante que o default 2) e containers consistentes com fundo suave e bordas arredondadas.

### Alterações

#### 1. `src/components/AppSidebar.tsx`
- Ícones da sidebar: aumentar para `h-[18px] w-[18px]` com `strokeWidth={1.5}`
- Ícone do logo: manter `h-5 w-5` com `strokeWidth={1.5}`

#### 2. `src/components/dashboard/DashboardKPIs.tsx`
- Container do ícone: `h-10 w-10 rounded-xl bg-primary/10` (mais visível)
- Ícone: `h-5 w-5 strokeWidth={1.5}`

#### 3. `src/components/AppHeader.tsx`
- Ícones de ação: `strokeWidth={1.5}` no Search e LogOut
- Logo: `strokeWidth={1.5}`

#### 4. `src/components/NotificationCenter.tsx`
- Bell e ícones de tipo: `strokeWidth={1.5}`

#### 5. Global — `src/index.css`
- Adicionar regra CSS global para todos os SVGs lucide: `stroke-width: 1.5` como override base, garantindo consistência mesmo em componentes que não passam a prop

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `src/index.css` | Regra global `.lucide { stroke-width: 1.5 !important; }` |
| `src/components/AppSidebar.tsx` | Ícones maiores (18px) com strokeWidth 1.5 |
| `src/components/dashboard/DashboardKPIs.tsx` | Container maior, ícone 20px, strokeWidth 1.5 |
| `src/components/AppHeader.tsx` | strokeWidth 1.5 nos ícones |
| `src/components/NotificationCenter.tsx` | strokeWidth 1.5 nos ícones |

