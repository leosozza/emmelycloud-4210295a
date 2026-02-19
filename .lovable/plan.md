

# Plano: App completa no iframe Bitrix24 + Corrigir chatbot

## Problema 1: Interface do iframe

A pagina `/bitrix24` carrega a **mesma aplicacao Vite** -- ou seja, Tailwind, Shadcn e todos os componentes React **estao disponiveis**. Nao ha necessidade de usar inline styles. O `Bitrix24App.tsx` pode e deve reutilizar os componentes reais da aplicacao (Cards, Tabs, Buttons, Flow editor, etc.).

### Solucao

Refatorar o `Bitrix24App.tsx` para:
- Usar **Tailwind CSS** e **componentes Shadcn** (Tabs, Card, Button, Badge, Input, Select, ScrollArea)
- Embeber o **Flow editor** (react-flow) diretamente na aba Flows, reutilizando os componentes de `src/components/flows/`
- Reutilizar o componente de **AgentCard** e **AgentFormDialog** na aba Agentes
- Reutilizar o **PlaygroundIA** (ou partes dele) na aba Playground
- Manter a logica BX24 (init, auth, member_id) mas com UI nativa da app

### Estrutura da nova pagina

```
Bitrix24App.tsx (container com BX24 init)
  |-- Header com gradiente (Tailwind)
  |-- Tabs (Shadcn Tabs component)
       |-- Conector: Card com status, logs, botao resync
       |-- Agentes: Lista de AgentCards + AgentFormDialog
       |-- Training: Upload de ficheiros de conhecimento
       |-- Flows: FlowEditor embebido (react-flow)
       |-- Playground: Chat com IA
       |-- Pagamentos: Config de gateways
```

### Alteracoes tecnicas

| Ficheiro | Alteracao |
|----------|-----------|
| `src/pages/Bitrix24App.tsx` | Reescrever usando Tailwind + Shadcn, remover todos os inline styles. Importar e reutilizar componentes reais (AgentCard, Flow editor, etc.) |

O ficheiro atual tem ~1192 linhas de inline styles. Sera substituido por ~400-500 linhas usando Tailwind e componentes Shadcn.

---

## Problema 2: Chatbot nao aparece no Bitrix24

Os logs mostram que o bot foi registado com sucesso (result ID: 10213). Na instalacao anterior, o registo falhou com `EVENT_WELCOME_MESSAGE_ERROR`, mas na reinstalacao mais recente, o bot registou-se corretamente.

O problema e que o Bitrix24 pode ter **dois bots registados** (o antigo com erro e o novo). Alem disso, o bot precisa de ser **desregistado antes de re-registar** (tal como fazemos com os robots).

### Solucao

No `bitrix24-install/index.ts`:
1. Antes de `imbot.register`, chamar `imbot.unregister` com o CODE do bot (para limpar registos antigos)
2. Registar novamente com os parametros corretos
3. Adicionar log do `botResult.result` (o bot ID) na tabela de integracoes para debugging

```typescript
// Delete existing bot first (safe for reinstall)
await callBitrix(clientEndpoint, accessToken, "imbot.unregister", { 
  BOT_ID: existingBotId // ou usar listagem para encontrar
});

// Re-register
const botResult = await callBitrix(clientEndpoint, accessToken, "imbot.register", {
  CODE: "emmely_ai_bot",
  TYPE: "B",
  ...
});
```

### Nota sobre o selector de chatbots

Na imagem, o selector mostra "Emmely Fernandes Advocacia" -- este e provavelmente o bot do PowerBot. O bot "Emmely AI" devera aparecer como opcao separada apos a correica do registo. O utilizador precisara de:
1. Reinstalar a app no Bitrix24
2. Ir a Contact Center > Open Line > Chatbots
3. Selecionar "Emmely AI" no dropdown

---

## Ficheiros a modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `src/pages/Bitrix24App.tsx` | Reescrita completa: inline styles para Tailwind + Shadcn + componentes reutilizados |
| `supabase/functions/bitrix24-install/index.ts` | Adicionar `imbot.unregister` antes de `imbot.register` para limpar bots duplicados |

## Resultado esperado

- Iframe do Bitrix24 com a **mesma qualidade visual** da app principal (Tailwind, Shadcn, mesmos componentes)
- Flow editor funcional dentro do iframe
- Bot "Emmely AI" visivel no selector de chatbots do Contact Center apos reinstalacao

