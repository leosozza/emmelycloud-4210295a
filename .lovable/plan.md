

## Integrar componentes de chat (chat-bubble, chat-input, chat-message-list) na view Chat IA do Bitrix24

### O que sera feito

Criar os componentes de chat reutilizaveis e refazer as views Chat IA e Playground para os usar, resultando numa UI mais limpa e profissional com auto-scroll, loading animation SVG, e layout consistente.

### Novos ficheiros a criar

| Ficheiro | Descricao |
|---|---|
| `src/components/hooks/use-auto-scroll.ts` | Hook de auto-scroll com detecao de posicao e scroll-to-bottom |
| `src/components/ui/message-loading.tsx` | Animacao SVG de 3 pontos para loading |
| `src/components/ui/chat-bubble.tsx` | ChatBubble, ChatBubbleMessage, ChatBubbleAvatar, ChatBubbleAction |
| `src/components/ui/chat-input.tsx` | Input de chat baseado em Textarea com estilo proprio |
| `src/components/ui/chat-message-list.tsx` | Lista de mensagens com auto-scroll e botao "scroll to bottom" |
| `src/components/ui/expandable-chat.tsx` | Chat expansivel (floating) - disponivel para uso futuro |

### Ficheiros a editar

**`src/pages/Bitrix24App.tsx`** - Refazer `ChatIABitrixView` (linhas 1329-1612) e `PlaygroundView` (linhas 1614-1780):

- Substituir o `div ref={scrollRef}` manual por `ChatMessageList` com auto-scroll nativo
- Substituir os divs de mensagem manuais (`b24-chat-msg-content`, `b24-chat-avatar`) por `ChatBubble` + `ChatBubbleAvatar` + `ChatBubbleMessage`
- Substituir o loading de `b24-typing-dots` pelo `MessageLoading` SVG animado
- Substituir o `textarea` manual pelo `ChatInput` com auto-resize
- Manter toda a logica de negocio (fetch agentes, sessoes, localStorage, sendMessage, markdown render)
- Manter o AudioRecordButton existente no footer

**`src/index.css`** - Nenhuma alteracao necessaria nas classes b24, os novos componentes usam Tailwind classes directamente.

### Estrutura visual resultante

```text
ChatIABitrixView
+------------------+----------------------------+
| Sidebar (w-60)   | ChatMessageList            |
| - Nova conversa  |   ChatBubble (received)    |
| - Agent selector |     ChatBubbleAvatar       |
| - Session list   |     ChatBubbleMessage      |
|                  |   ChatBubble (sent)        |
|                  |     ChatBubbleMessage      |
|                  |   [scroll-to-bottom btn]   |
|                  +----------------------------+
|                  | Footer                     |
|                  |   ChatInput + Send btn     |
+------------------+----------------------------+
```

### Detalhes tecnicos

- `ChatBubble` tem variantes `sent` e `received` com layout `ai` que posiciona o avatar ao lado
- `ChatBubbleMessage` com `isLoading` renderiza o `MessageLoading` SVG automaticamente
- `ChatMessageList` usa `useAutoScroll` que detecta se o utilizador fez scroll para cima e mostra um botao flutuante para voltar ao fundo
- `ChatInput` e um wrapper de `Textarea` com classe de altura fixa e auto-complete off
- O `expandable-chat.tsx` fica disponivel para uso futuro (chat flutuante) mas nao sera usado directamente nas views actuais

Nenhuma nova dependencia NPM (todas ja estao instaladas). Nenhuma migracao de BD.

