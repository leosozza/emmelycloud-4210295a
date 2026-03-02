

## Redesenho Completo da Interface

O problema e que as alteracoes anteriores so mudaram variaveis de cor mas nao redesenharam os componentes visuais. Vou fazer um redesenho completo: header, KPIs, graficos, cards, layout do dashboard — tudo com visual moderno e coerente com a paleta vermelha/dourada.

### Ficheiros a alterar

**1. `src/index.css`** — Reescrever completamente:
- Variaveis CSS `:root` e `.dark` com os valores exactos fornecidos (hex directo, sem HSL)
- Remover TODOS os estilos legacy `.b24-*` (stepper, table, chat, etc.) — simplificar drasticamente
- Manter apenas gradientes actualizados e estilos base
- Font import Poppins

**2. `src/components/AppHeader.tsx`** — Redesenhar header:
- Fundo glassmorphism (`bg-card/80 backdrop-blur-lg`) em vez do gradiente solido
- Logo com icone em fundo gradient pill
- Barra de pesquisa com estilo card/input em vez de branco transparente
- Acoes com estilo mais limpo e moderno
- Remover classe `bg-bitrix-gradient` e texto branco hardcoded

**3. `src/components/dashboard/DashboardKPIs.tsx`** — Redesenhar KPIs:
- Substituir BentoCards com gradiente animado por cards limpos com fundo `card`, icone colorido em circulo, valor grande e indicador de mudanca
- Estilo "flat modern" — sem gradientes pesados nos KPIs
- Cada KPI com borda esquerda colorida ou icone em circulo com cor tematica
- Layout responsivo 2→3→6 colunas mantido

**4. `src/components/dashboard/DashboardChartsLive.tsx`** — Modernizar graficos:
- Cards com `rounded-2xl` e sombra suave
- Tooltips estilizados com `contentStyle` customizado
- Cores dos graficos alinhadas com `--chart-1..5` do novo tema
- Grids mais subtis (opacidade reduzida)
- Adicionar area preenchida no LineChart (AreaChart)

**5. `src/components/dashboard/RecentLeads.tsx`** — Redesenhar lista:
- Avatares com gradiente suave em vez de cor solida
- Hover states mais pronunciados
- Badge com cantos mais arredondados
- Separadores mais subtis

**6. `src/components/dashboard/DashboardSidebar.tsx`** — Modernizar sidebar:
- Progress bars coloridas em vez de texto simples para "Top Areas"
- Avatares de equipa com anel de cor
- Cards com hover lift effect

**7. `src/pages/Index.tsx`** — Refinar layout:
- Saudacao com emoji animado (wave)
- Subtitle com badge de "live" a piscar
- Spacing e gap mais generosos
- Grid dos graficos com 2 colunas equilibradas

**8. `src/components/PageHeader.tsx`** — Modernizar:
- Substituir gradiente solido por fundo `card` com borda e icone decorativo
- Texto em `foreground` em vez de branco forcado

**9. `src/components/AppLayout.tsx`** — Refinar Dock:
- Fundo glassmorphism no dock
- Indicador activo com dot em vez de cor

### Componentes novos

Nenhum ficheiro novo — apenas redesenho dos existentes.

### Resultado esperado

```text
+----------------------------------------------------------+
| [logo] Emmely Cloud    [pesquisa...]    🇧🇷 🔔 [avatar] |  ← header glassmorphism
+----------------------------------------------------------+
| Bom dia, João 👋                        [7d▼] [⚙️]      |
| segunda-feira, 2 de março de 2026  🟢 live               |
+----------------------------------------------------------+
| ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       |
| │ 12  │ │  3  │ │R$8k │ │ 24% │ │  7  │ │  4  │       |
| │Leads│ │ SLA │ │Rec. │ │Conv.│ │Casos│ │Cont.│       |
| └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       |  ← cards flat com icone colorido
+----------------------------------------------------------+
| ┌──────────────┐  ┌──────────────┐                       |
| │  Funil       │  │ Leads/Origem │                       |
| │  ████████    │  │    🍩        │                       |
| └──────────────┘  └──────────────┘                       |  ← charts modernos
| ┌──────────────┐  ┌──────────────┐                       |
| │  Receita/Area│  │  Tendência   │                       |
| │  ═══════     │  │  📈          │                       |
| └──────────────┘  └──────────────┘                       |
+----------------------------------------------------------+
| ┌──────────────────────┐  ┌───────────┐                  |
| │  Últimos Leads       │  │ Top Áreas │                  |
| │  ──────────────      │  │ ████ 40%  │                  |
| │  ──────────────      │  │ ███  30%  │                  |
| └──────────────────────┘  │ ██   20%  │                  |
|                           └───────────┘                  |
+---------------------------[●●●● dock ●●●●]---------------+
```

### Detalhes tecnicos

- Header usa `backdrop-blur-lg` e `bg-card/80` para efeito glass
- KPIs usam `Card` com `border-l-4` colorido por metrica + icone em circulo com bg tematico
- Graficos usam `rounded-2xl`, tooltips com `bg-card border shadow-lg`, grid com `stroke-dasharray` e opacidade baixa
- PageHeader muda de gradiente para `bg-card border` com texto normal
- Dock recebe `bg-card/80 backdrop-blur-md border shadow-xl`
- Todas as cores hardcoded (`#9b2c2c`, etc.) sao removidas dos componentes e substituidas por tokens CSS

