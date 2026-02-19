
# Fix crítico: Chatbot Emmely AI não aparece no Contact Center Bitrix24

## Diagnóstico definitivo baseado na documentação oficial

### Erro no `imbot.register` — causa raiz do bot não aparecer

A documentação oficial em `imbot.register` define:

- `TYPE: "B"` — chat-bot normal (respostas imediatas, só chat privado)
- `TYPE: "O"` — chat-bot para Open Lines (aparece no Contact Center)
- `TYPE: "S"` — supervisor (acesso a todas as mensagens)
- `TYPE: "H"` — **NÃO EXISTE na documentação oficial** — é um valor inválido!

O código atual usa `TYPE: "H"` (Human-like), que não é reconhecido pelo Bitrix24 para o selector de chatbot de Open Lines.

**Solução**: Usar `TYPE: "B"` + `OPENLINE: "Y"` na raiz do objeto (modo híbrido) conforme a documentação.

### Segundo erro crítico — `OPENLINE` no lugar errado

O `OPENLINE: "Y"` está dentro do objeto `PROPERTIES`, mas a documentação mostra que é um parâmetro de **raiz** do `imbot.register`:

```
// ERRADO (atual):
{
  TYPE: "H",
  PROPERTIES: {
    NAME: "Emmely AI",
    OPENLINE: "Y"   // ← ERRADO, dentro de PROPERTIES
  }
}

// CORRETO (conforme docs):
{
  TYPE: "B",
  OPENLINE: "Y",    // ← raiz do objeto
  PROPERTIES: {
    NAME: "Emmely AI"
  }
}
```

### O que é o "Chatbot" na aba de Integrações — problema de design

O utilizador está certo: a aba "Chatbot" em `/integracoes` mostra WhatsApp e Instagram com toggles, mas isso está conceptualmente errado. O chatbot no Bitrix24 é o **IM Bot** registado via `imbot.register`, que aparece no Contact Center → Open Lines → selecionar chatbot. A configuração de qual agente responde nas Open Lines já existe na aba **Conector** do `Bitrix24App.tsx` (campo "Agente do Canal Aberto"). A aba Chatbot em `/integracoes` confunde o utilizador e deve ser **reformulada** para mostrar apenas o estado do bot Bitrix24 e a configuração do agente padrão para canais diretos (WhatsApp/Instagram via chatbot automático, que é diferente do IM Bot).

## Plano de Correção

### Parte 1 — Corrigir o registo do bot (causa raiz)

**Ficheiro: `supabase/functions/bitrix24-install/index.ts`**

Alterar o `imbot.register` de:
```typescript
TYPE: "H",
PROPERTIES: {
  NAME: "Emmely AI",
  OPENLINE: "Y",   // ERRADO
}
```
Para:
```typescript
TYPE: "B",        // Standard bot com OPENLINE habilitado = modo híbrido
OPENLINE: "Y",    // RAIZ, não dentro de PROPERTIES
PROPERTIES: {
  NAME: "Emmely AI",
  WORK_POSITION: "Assistente Virtual IA",
  COLOR: "GREEN",  // Bitrix24 usa nomes de cor, não hex
}
```

Também remover o `COLOR` em formato hex (`"#25D366"`) que pode ser inválido — a documentação mostra valores como `"GREEN"`, `"BLUE"`, `"AQUA"`, etc.

### Parte 2 — Corrigir o `bitrix24-rebind-events` (mesmo fix)

**Ficheiro: `supabase/functions/bitrix24-rebind-events/index.ts`**

Aplicar o mesmo fix no `imbot.update` ou re-register que existe nesta função, para que quando o utilizador clique em "Re-registar Bot" o resultado seja correto.

### Parte 3 — Reformular a aba "Chatbot" em `/integracoes`

A aba atual mostra "WhatsApp — Chatbot IA" e "Instagram — Chatbot IA" com toggles que escrevem em `chatbot_channel_settings`. Isso é funcionalidade correta mas com **título e contexto errados** que confundem o utilizador. Renomear e reorganizar para:

**Nova estrutura da aba "Chatbot"**:

**Secção 1 — Bot Bitrix24 (Contact Center)**
- Estado do bot registado (ID, nome)
- Instrução: "Para ativar em Open Lines, vá ao Contact Center → selecione a linha → Chatbot → Emmely AI"
- Botão "Re-registar Bot" (que chama a edge function para re-registar com os parâmetros corretos)
- Seletor de agente padrão para o canal aberto (já existente no DashboardView do Bitrix24App)

**Secção 2 — Chatbot Automático (WhatsApp / Instagram)**
- Explicação clara: "Resposta automática para mensagens recebidas diretamente via WhatsApp e Instagram (sem necessidade do Bitrix24)"
- Os toggles e seletores de agente existentes — MAS com label correto

Isto resolve a confusão: o utilizador entende que:
1. Para o Bitrix24 Contact Center → configurar na aba Conector do Bitrix24App
2. Para WhatsApp/Instagram diretos → configurar nesta aba

### Parte 4 — Botão de re-registo no Bitrix24App (DashboardView)

O botão "Re-registar Bot" que já existe no `Bitrix24App.tsx` deve também aplicar o fix correto (`TYPE: "B"`, `OPENLINE: "Y"` na raiz). Verificar se a edge function `bitrix24-rebind-events` já faz o re-registo correto e corrigir se necessário.

## Ficheiros a Alterar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Fix `imbot.register`: `TYPE: "B"`, `OPENLINE: "Y"` na raiz, `COLOR: "GREEN"` |
| `supabase/functions/bitrix24-rebind-events/index.ts` | Verificar e aplicar o mesmo fix no re-registo do bot |
| `src/pages/Integracoes.tsx` | Reformular `ChatbotTab`: separar Bot Bitrix24 de Chatbot Automático (WA/IG) com labels claros |

## Sequência após o deploy

1. Clicar em **"Re-registar Bot"** no painel Bitrix24App → bot re-registado com `TYPE: "B"` + `OPENLINE: "Y"` correto
2. No Bitrix24 → Contact Center → abrir uma Open Line → Configurações → Chatbot → **Emmely AI** aparece na lista
3. Selecionar Emmely AI → guardar → o bot começa a responder automaticamente

## O que NÃO muda

- A tabela `chatbot_channel_settings` e os dados já guardados — continuam a controlar o chatbot automático para WA/Instagram
- O sistema de agentes IA, edge functions de reply, etc.
- A UI do Bitrix24App — apenas o bug no `imbot.register` é corrigido
