

## Integrar Luma Spin + Watermark "Emmely Fernandes"

### Ficheiros

**1. Criar `src/components/ui/luma-spin.tsx`**
- Componente de loading spinner com animação CSS pura (dois quadrados animados com `inset` transitions)
- Reconstruir o JSX correctamente (o código fornecido tem tags malformadas)
- Usar Tailwind + style tag inline para a keyframe animation
- Aceitar props opcionais: `className`, `size`

**2. Editar `src/components/AppLayout.tsx`**
- Substituir o loading state actual (Scale icon + pulse) pelo novo `LumaSpin`
- Adicionar watermark "Emmely Fernandes" no fundo do layout principal (dentro do `<main>`)
- Watermark: texto fixo, opacidade muito baixa (~3-5%), centrado, `pointer-events-none`, `select-none`, fonte grande rotacionada

### Watermark
- Posição: fixed no centro do viewport, `z-0`, por baixo do conteúdo
- Estilo: `text-6xl font-bold text-foreground/[0.03] rotate-[-30deg]` repetido ou single centered
- `pointer-events-none select-none` para não interferir com interacção

### Resultado
- Loading screen usa o spinner Luma animado em vez do ícone pulsante
- "Emmely Fernandes" aparece subtilmente como marca d'água no fundo de todas as páginas

