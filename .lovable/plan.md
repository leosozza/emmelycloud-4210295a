

# Atualizar ChatbotTab em /integracoes para Multi-Bot

## Problema
A secção "Chatbot" na página Integrações ainda mostra apenas um bot fixo "Emmely AI" com um único `bot_id` do `config`. Com a nova arquitectura multi-bot, deve mostrar **todos os agentes ativos** e o seu estado individual de registo no Bitrix24.

## Alterações

### `src/pages/Integracoes.tsx` — ChatbotTab

1. **Carregar agentes com `bitrix_bot_id`**: Alterar a query para incluir `id, name, bitrix_bot_id, is_active`
2. **Substituir o card único "Emmely AI"** por uma lista de cards — um por agente ativo — mostrando:
   - Nome do agente
   - Badge "Registado (Bot #ID)" se `bitrix_bot_id` existe, ou "Não registado" se null
3. **Atualizar `handleReregisterBot`**: Após sucesso, mostrar o número de bots registados (usar `data.registered` do response) em vez de um único `bot_id`
4. **Atualizar instruções**: Em vez de "selecione Emmely AI", explicar que cada agente aparece como bot separado no Contact Center
5. **Remover referência a `config.bot_id`** (já não relevante)

### Ficheiro

| Ficheiro | Acção |
|---|---|
| `src/pages/Integracoes.tsx` | Refactoring do `ChatbotTab` para listar agentes com estado multi-bot |

