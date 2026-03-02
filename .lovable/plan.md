

## Melhorar a Pagina Inicial (Dashboard)

### Objectivo

Modernizar visualmente o dashboard com cards KPI estilo bento usando gradientes animados, melhor hierarquia visual e saudacao personalizada.

### Novos ficheiros

| Ficheiro | Descricao |
|---|---|
| `src/components/ui/animated-gradient-with-svg.tsx` | Componente de gradiente animado com SVG circles |
| `src/components/hooks/use-debounced-dimensions.ts` | Hook para medir dimensoes com debounce (dependencia do gradiente) |

### Ficheiros a editar

**`tailwind.config.ts`**
- Adicionar keyframe `background-gradient` e animacao correspondente para o efeito de gradiente animado

**`src/components/dashboard/DashboardKPIs.tsx`**
- Substituir os cards simples por BentoCards com `AnimatedGradient` como fundo
- Cada KPI tera um gradiente animado unico com cores alinhadas ao tema (azul para leads, verde para receita, etc.)
- Adicionar animacao de entrada escalonada com `framer-motion` (staggerChildren)
- Manter os mesmos dados e logica existente

**`src/pages/Index.tsx`**
- Substituir o `PageHeader` por uma saudacao personalizada com hora do dia ("Bom dia", "Boa tarde", "Boa noite") e nome do utilizador do perfil
- Adicionar data actual formatada
- Layout mais respiravel com spacing ajustado

**`src/components/PageHeader.tsx`**
- Sem alteracoes (usado por outras paginas)

### Estrutura visual

```text
+--------------------------------------------------+
| Bom dia, João                           [filtro]  |
| Terça-feira, 2 de Março de 2026        [config]   |
+--------------------------------------------------+
| [Leads ████] [SLA ████] [Receita ████]           |
| [Conv. ████] [Casos ████] [Contratos ████]       |
|  (cada card com gradiente animado de fundo)       |
+--------------------------------------------------+
| [Funil]        [Leads/Origem]                     |
| [Receita/Area] [Tendencia]                        |
+--------------------------------------------------+
| [Ultimos Leads]              [Sidebar]            |
+--------------------------------------------------+
```

### Detalhes tecnicos

- `AnimatedGradient` usa SVG circles com CSS animation `background-gradient` que se movem lentamente
- Cada KPI card recebe array de 4 cores (ex: `["#2283d8", "#4a9fe5", "#7b5ea7", "#2283d8"]`)
- Cards usam `motion.div` com `staggerChildren: 0.1` para entrada sequencial
- O gradiente fica como fundo absoluto com `blur-2xl` e `overflow-hidden rounded-xl`
- A saudacao usa `new Date().getHours()` para determinar periodo do dia
- Nome do utilizador vem do `useAuthContext` (session.user) ou perfil

