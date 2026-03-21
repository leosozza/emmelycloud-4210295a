

# Correção do Painel Emmely AI — Colapso e Badges

## Problemas

1. **Painel ocupa área excessiva** — `max-height: 50vh` é demasiado; deveria iniciar colapsado
2. **Não colapsa corretamente** — o painel começa expandido por defeito
3. **Badges saem para fora** — falta `flex-wrap: nowrap` e scroll horizontal tipo galeria

## Correções

### Ficheiro: `supabase/functions/bitrix24-crm-tab/index.ts`

**CSS:**
- `#ai-panel` inicia com classe `collapsed` (max-height: 40px)
- Reduzir max-height expandido para `35vh`
- `#agent-badges`: garantir `flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch;` para scroll horizontal tipo galeria
- Esconder scrollbar do badges mas manter funcionalidade de arrastar

**HTML:**
- Adicionar classe `collapsed` ao `<div id="ai-panel">` por defeito

**JS:**
- `toggleAiPanel()` já existe e faz toggle da classe — manter como está

