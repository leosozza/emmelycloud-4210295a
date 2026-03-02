

## Aplicar Novo Tema Vermelho/Dourado + Componente EvervaultCard

### Alteracoes

**1. `src/index.css`** — Substituir completamente as variaveis CSS e gradientes:

| Variavel | Light (hex → hsl) | Dark (hex → hsl) |
|---|---|---|
| --background | #faf7f5 → 25 33% 97% | #1c1917 → 24 12% 10% |
| --foreground | #1a1a1a → 0 0% 10% | #f5f5f4 → 40 20% 96% |
| --card | #faf7f5 → 25 33% 97% | #292524 → 12 10% 15% |
| --primary | #9b2c2c → 0 56% 39% | #b91c1c → 0 73% 42% |
| --secondary | #fdf2d6 → 43 93% 91% | #92400e → 30 83% 31% |
| --muted | #f0ebe8 → 22 20% 93% | #292524 → 12 10% 15% |
| --accent | #fef3c7 → 48 96% 89% | #b45309 → 32 91% 37% |
| --destructive | #991b1b → 0 68% 35% | #ef4444 → 0 84% 60% |
| --border | #f5e8d2 → 37 68% 89% | #44403c → 33 7% 25% |
| --input | #f5e8d2 → 37 68% 89% | #44403c → 33 7% 25% |
| --ring | #9b2c2c → 0 56% 39% | #b91c1c → 0 73% 42% |
| + todas sidebar-*, chart-*, gradient-* | Converter correspondentes | Converter correspondentes |

- Actualizar font-family para `Poppins, sans-serif`
- Actualizar Google Fonts import para Poppins
- Actualizar gradientes `.bg-bitrix-gradient` para tons vermelhos/dourados (`#9b2c2c`, `#b45309`, `#7f1d1d`)
- `--radius` para `0.375rem`

**2. `src/components/dashboard/DashboardKPIs.tsx`** — Actualizar cores dos gradientes dos BentoCards para paleta vermelha/dourada:
- Leads: vermelhos (`#9b2c2c`, `#b91c1c`)
- SLA: dourados (`#b45309`, `#92400e`)
- Receita: vermelhos escuros (`#7f1d1d`)
- Conversao: ambar (`#fbbf24`, `#f59e0b`)
- Casos: vermelho medio (`#ef4444`, `#dc2626`)
- Contratos: castanho/terracota (`#92400e`, `#b45309`)

**3. `src/components/ui/evervault-card.tsx`** — Criar novo componente (copiar do codigo fornecido). Framer-motion ja esta instalado.

**4. `tailwind.config.ts`** — Actualizar font-family para Poppins.

### Ficheiros

| Ficheiro | Accao |
|---|---|
| `src/index.css` | Reescrever variaveis `:root` e `.dark`, gradientes, font imports |
| `src/components/dashboard/DashboardKPIs.tsx` | Actualizar arrays de cores dos BentoCards |
| `src/components/ui/evervault-card.tsx` | Criar componente |
| `tailwind.config.ts` | Actualizar fontFamily para Poppins |

