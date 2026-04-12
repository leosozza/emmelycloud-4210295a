

# Pretext para Melhorar a Pagina de Conversas WhatsApp

## O que e o Pretext

Pretext (42.9k stars) e uma biblioteca JavaScript/TypeScript de **medicao e layout de texto** que calcula alturas e larguras de paragrafos **sem tocar no DOM**. Usa o canvas do browser para medir segmentos de texto e depois faz layout puramente aritmetico.

## Conceitos Aplicaveis ao Atendimento

### 1. Virtualizacao de Mensagens com Altura Pre-calculada (ALTO IMPACTO)

**Problema actual:** O `ChatPanel.tsx` renderiza TODAS as mensagens no DOM (`allMessages.map`). Com conversas longas (500+ mensagens), isto causa:
- Scroll lento e janky
- Consumo de memoria elevado
- O infinite scroll carrega paginas mas renderiza tudo no DOM

**Solucao com Pretext:** Usar `prepare()` + `layout()` para pre-calcular a altura de cada bolha de mensagem sem DOM. Depois, usar uma lista virtualizada (ex: `react-window` ou `@tanstack/virtual`) que so renderiza as ~20 mensagens visiveis, usando as alturas exactas do Pretext.

```text
Fluxo:
Mensagem.content → prepare(text, '13.5px Inter') → layout(prepared, bubbleMaxWidth, lineHeight)
  → height conhecida SEM renderizar
  → virtualizer usa essa altura para posicionar
  → so renderiza mensagens no viewport
```

### 2. Shrink-wrap de Bolhas (MEDIO IMPACTO)

**Problema actual:** As bolhas usam `max-w-[80%]` mas mensagens curtas ("ok", "sim") ficam com largura desproporcionada ao texto.

**Solucao com Pretext:** Usar `walkLineRanges()` para calcular a largura minima que acomoda o texto sem overflow. A bolha fica "justa" ao conteudo, exactamente como o WhatsApp real faz.

### 3. Auto-resize do Textarea sem Layout Reflow (MEDIO IMPACTO)

**Problema actual:** O `ChatInput.tsx` (linha 42-44) faz auto-resize manipulando `el.style.height` e lendo `el.scrollHeight` — isto forca layout reflow a cada tecla.

**Solucao com Pretext:** Usar `prepare()` com `whiteSpace: 'pre-wrap'` + `layout()` para calcular a altura do textarea puramente em JS, sem reflow.

### 4. Preview de Ultima Mensagem na Lista (BAIXO IMPACTO)

**Problema actual:** `ConversationList.tsx` trunca o preview com CSS `truncate`. Se a mensagem tiver emojis, RTL ou caracteres especiais, o truncamento pode ser visualmente errado.

**Solucao com Pretext:** Usar `measureLineStats()` para garantir que o preview ocupa exactamente 1 linha e truncar com precisao.

---

## Plano de Implementacao (2 fases)

### Fase 1: Virtualizacao de Mensagens (PRIORIDADE)

**Alteracoes:**
- Instalar `@chenglou/pretext` e `@tanstack/react-virtual`
- Criar `src/lib/messageLayout.ts`: funcao que recebe uma `Message` e retorna a altura calculada via Pretext, considerando:
  - Largura maxima da bolha (65% do container em desktop, 80% em mobile)
  - Texto: `prepare(content, '13.5px Inter')` + `layout()`
  - Adicionar padding, source label height, timestamp row, media heights (fixas)
- Refactor `ChatPanel.tsx`:
  - Substituir o `div` com scroll manual por um virtualizer (`useVirtualizer` do @tanstack/virtual)
  - Cada item virtualizado renderiza `<MessageBubble>` so quando visivel
  - Manter auto-scroll para baixo (stick-to-bottom)
  - Manter separadores de data (como items virtuais de altura fixa)
- Refactor `Atendimento.tsx`:
  - O infinite scroll (carregar mais mensagens antigas) dispara quando o virtualizer detecta que o utilizador chegou ao topo

### Fase 2: Shrink-wrap de Bolhas + Textarea

**Alteracoes:**
- `MessageBubble.tsx`: Usar `walkLineRanges()` para calcular a largura ideal da bolha e aplicar como `style.width`
- `ChatInput.tsx`: Substituir o reflow-based auto-resize por calculo via Pretext

### Ficheiros a Alterar/Criar

| Ficheiro | Accao |
|---|---|
| `package.json` | Adicionar `@chenglou/pretext` e `@tanstack/react-virtual` |
| `src/lib/messageLayout.ts` | **Novo** — calculo de altura/largura de mensagens via Pretext |
| `src/components/atendimento/ChatPanel.tsx` | Virtualizar lista de mensagens |
| `src/components/atendimento/MessageBubble.tsx` | Shrink-wrap opcional |
| `src/components/atendimento/ChatInput.tsx` | Auto-resize sem reflow |
| `src/pages/Atendimento.tsx` | Ajustar infinite scroll para virtualizer |

### Prioridade
1. **Fase 1 (Virtualizacao)** — impacto directo na performance com conversas longas
2. **Fase 2 (Shrink-wrap + Textarea)** — refinamento visual e de micro-performance

