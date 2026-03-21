

# Emmely AI Consulta — Mover para Aba Dedicada

## Problema
O painel colapsável no fundo ocupa pouco espaço e as respostas da IA ficam ilegíveis. A área de chat AI compete com a área de mensagens do cliente.

## Solução
Transformar o layout numa estrutura de **2 abas** (tabs) que ocupam toda a área disponível:

```text
┌──────────────────────────────────┐
│ Header (avatar, nome, badge)     │
├──────────────────────────────────┤
│ [💬 Conversa]  [🤖 Consulta IA] │  ← tabs
├──────────────────────────────────┤
│                                  │
│   Conteúdo da aba ativa          │
│   (usa 100% da altura)           │
│                                  │
└──────────────────────────────────┘
```

### Aba "Conversa" (tab padrão)
- Contém o que existe hoje: mensagens, barra de envio ao cliente, botão devolver ao bot, e "iniciar conversa"

### Aba "Consulta IA" 
- Badges de agentes no topo (galeria horizontal)
- Chat AI ocupa toda a área central com scroll
- Input + botão enviar em baixo
- Botões de ação rápida (Resumir, Sugerir, etc.)
- Botão "Usar resposta" copia para o input da aba Conversa

### Mudanças Técnicas

**Ficheiro:** `supabase/functions/bitrix24-crm-tab/index.ts`

**CSS:**
- Remover `#ai-panel`, `.collapsed`, max-height constraints
- Adicionar estilos de tabs (`.tab-bar`, `.tab-btn`, `.tab-btn.active`)
- Tab content com `flex: 1; overflow: hidden; display: flex; flex-direction: column`

**HTML:**
- Adicionar barra de tabs após o header
- Mover conteúdo de conversa para `#tab-conversa`
- Mover conteúdo AI para `#tab-consulta` (sem wrapper colapsável)
- Remover `#ai-panel` e `toggleAiPanel()`

**JS:**
- `switchTab(tabName)` alterna visibilidade entre `#tab-conversa` e `#tab-consulta`
- `quickAsk()` faz `switchTab('consulta')` em vez de toggle do painel
- `useResponse()` faz `switchTab('conversa')` após copiar texto

