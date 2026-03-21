

# Redesign do Painel Emmely AI — Chat com Badges de Agentes

## Situação Atual
O painel AI no CRM Tab é um painel colapsável no fundo com 4 botões de ação rápida (Resumir, Sugerir, Sentimento, Procedimento) e um input com suporte a `@agente`. O agente é selecionado via dropdown `@mention` e reseta após cada envio — pouco intuitivo.

## O que será feito

Transformar o painel AI numa interface de chat completa estilo WhatsApp com:
1. **Badges visuais de agentes** — botões coloridos com inicial do agente, sempre visíveis acima do input, para selecionar qual agente responde
2. **Chat persistente por sessão** — histórico de conversa com o agente selecionado, com bolhas estilo mensageiro
3. **Agente ativo fixo** — o agente selecionado fica ativo até ser trocado (não reseta após envio)
4. **Contexto automático** — injeta o resumo da conversa do cliente como contexto na primeira mensagem
5. **Botão "Usar resposta"** mantido — para copiar resposta da IA para o campo de envio ao cliente

## Design Visual

```text
┌─────────────────────────────────┐
│ 🤖 Emmely AI Consulta          │
│ ┌─────────────────────────────┐ │
│ │ [Geral] [Vistos] [Prev] .. │ │  ← badges de agentes (scroll horizontal)
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  Bolha user: "qual prazo?" │ │
│ │  Bolha bot: "O prazo é..." │ │  ← chat com scroll
│ │       [Usar resposta]      │ │
│ └─────────────────────────────┘ │
│ ┌───────────────────────┐ [▶]  │  ← input + send
│ │ Escreva a pergunta... │      │
│ └───────────────────────┘      │
│ [Resumir][Sugerir][Sentimento] │  ← ações rápidas mantidas
└─────────────────────────────────┘
```

## Mudanças Técnicas

### Ficheiro: `supabase/functions/bitrix24-crm-tab/index.ts`

**CSS:**
- Adicionar estilos para badges de agentes (horizontal scroll, badge ativo com destaque)
- Reformular o `#ai-panel` para ocupar mais espaço (50vh) e ter layout de chat

**HTML:**
- Substituir o dropdown `@mention` por uma fila horizontal de badges de agentes
- Cada badge: círculo com inicial + nome curto, cor única por agente
- Badge activo tem borda/destaque visual
- Mover ações rápidas (Resumir, Sugerir, etc.) para baixo do input

**JavaScript:**
- `selectedAgentId` começa com o primeiro agente (não null)
- `selectAgent(id)` marca o badge activo e NÃO reseta após envio
- Remover lógica de `@mention` e dropdown
- `sendAiMessage()` usa sempre `ai-playground` com o agente selecionado
- Limpar histórico AI ao trocar de agente (novo contexto)
- Input placeholder dinâmico: "Pergunte ao {agenteName}..."

