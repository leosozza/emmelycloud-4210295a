
# Otimização de Tokens no Agente de IA com TOON + Compressão Inteligente

## Diagnóstico atual

Analisando o `ai-process-message/index.ts`, existem 3 fontes principais de consumo excessivo de tokens:

### Fonte 1 — Histórico de conversa (15 mensagens)
Passado como array `messages` da API OpenAI. **Não pode ser substituído por TOON** porque é formato de protocolo fixo. Mas pode ser **reduzido e comprimido**.

### Fonte 2 — Base de Conhecimento (20 chunks injetados no system prompt)
```
--- BASE DE CONHECIMENTO ---
[chunk 1 completo]

[chunk 2 completo]
...
--- FIM DA BASE DE CONHECIMENTO ---
```
Esta parte **pode ser reformatada com TOON** pois são arrays uniformes de objetos texto. Redução esperada: ~30-40%.

### Fonte 3 — System prompt verboso com anti-repetição
Frases longas em português que repetem instruções. Pode ser comprimido.

## Estratégia de otimização (sem biblioteca TOON — implementação nativa em Deno)

O TOON é uma spec aberta. A biblioteca npm `@toon-format/toon` **não é compatível com Deno edge functions** diretamente (usa Node.js). A solução é implementar a serialização TOON relevante para o caso de uso diretamente como função utilitária na edge function.

### O que vamos implementar

**Técnica 1 — TOON para Knowledge Base** (maior impacto)

Em vez de:
```
--- BASE DE CONHECIMENTO ---
Os serviços jurídicos incluem assessoria em imigração...

Taxas de serviço são calculadas conforme...
--- FIM DA BASE DE CONHECIMENTO ---
```

Com TOON tabular:
```
KB[3]{idx,content}:
  1,Os serviços jurídicos incluem assessoria em imigração...
  2,Taxas de serviço são calculadas conforme...
  3,...
```

**Técnica 2 — Compressão do histórico de conversa (maior impacto prático)**

Em vez de passar 15 mensagens completas no array `messages` da API, implementamos **sumarização automática** para conversas longas:
- Se há mais de 8 mensagens: sumariza as mais antigas num bloco no system prompt
- As últimas 4-6 mensagens ficam como `messages[]` reais (contexto imediato)
- Economia estimada: 40-60% do contexto de histórico

```typescript
// Estratégia híbrida:
// system prompt ← resumo comprimido das mensagens antigas (TOON tabular)
// messages[]    ← apenas as últimas 5 mensagens (protocolo OpenAI)
```

**Técnica 3 — Prompt do sistema mais curto**

O anti-repetition prompt atual repete até 100 chars de cada mensagem recente. Será encurtado para 50 chars.

## Ficheiros a modificar

### `supabase/functions/ai-process-message/index.ts`

Adicionar funções utilitárias no topo:

```typescript
// ─── Token optimization utilities ───

// Serializa array de chunks em formato TOON tabular (compacto, sem biblioteca externa)
function chunksToToon(chunks: { content: string }[]): string {
  if (chunks.length === 0) return "";
  const rows = chunks.map((c, i) => `  ${i + 1},${c.content.replace(/,/g, ";").replace(/\n/g, " ").substring(0, 500)}`);
  return `KB[${chunks.length}]{idx,content}:\n${rows.join("\n")}`;
}

// Comprime histórico antigo em bloco de contexto para o system prompt
function compressOldHistory(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return "";
  const rows = messages.map((m, i) =>
    `  ${i + 1},${m.role === "user" ? "U" : "A"},${m.content.replace(/,/g, ";").replace(/\n/g, " ").substring(0, 200)}`
  );
  return `\n\nCONTEXTO_ANTERIOR[${messages.length}]{idx,role,msg}:\n${rows.join("\n")}\n`;
}
```

Modificar a lógica de montagem do contexto:

```typescript
// ANTES: 15 mensagens no messages[] + 20 chunks no system prompt (muito tokens)
// DEPOIS: 
//   - 5 mensagens recentes no messages[]
//   - mensagens antigas comprimidas no system prompt em formato TOON
//   - chunks da KB em formato TOON tabular

const RECENT_MSG_COUNT = 5;
const MAX_CHUNKS = 20;

// Dividir histórico
const allHistory = (history || []).reverse(); // cronológico
const recentMessages = allHistory.slice(-RECENT_MSG_COUNT).map((m) => ({
  role: m.direction === "inbound" ? "user" : "assistant",
  content: m.content,
}));
const olderMessages = allHistory.slice(0, -RECENT_MSG_COUNT).map((m) => ({
  role: m.direction === "inbound" ? "user" : "assistant",
  content: m.content,
}));

// Knowledge base em formato TOON
const kbToon = chunksToToon(chunks || []);
const knowledgeContext = kbToon 
  ? `\n\n--- BASE DE CONHECIMENTO ---\n${kbToon}\n--- FIM ---\n` 
  : "";

// Contexto histórico comprimido
const compressedHistory = compressOldHistory(olderMessages);

// System prompt final
const systemPrompt = agent.system_prompt + knowledgeContext + compressedHistory + contactContext + antiRepetitionPrompt;

// Enviar apenas mensagens recentes ao modelo
// messages = recentMessages (5 mensagens, não 15)
```

### `supabase/functions/ai-playground/index.ts`

Aplicar a mesma serialização TOON para a base de conhecimento (usado no Playground e no treinamento de agentes).

## Estimativa de redução de tokens

| Componente | Antes | Depois | Redução |
|---|---|---|---|
| Histórico conversa (messages[]) | 15 mensagens completas | 5 mensagens | ~65% |
| Histórico antigo | não incluído | TOON comprimido no system | ~50% vs incluir tudo |
| Base de conhecimento | 20 chunks em texto livre | TOON tabular | ~35% |
| Anti-repetição | 100 chars/mensagem | 50 chars/mensagem | ~30% |
| **Total estimado** | **baseline** | | **~40-50% menos tokens** |

## Limitações e trade-offs

- **TOON para histórico antigo**: o modelo vê o contexto em formato tabular, não como mensagens reais — pode perder nuances subtis em conversas muito complexas. As últimas 5 mensagens reais compensam.
- **Chunks limitados a 500 chars**: se um chunk tem informação importante no final, pode ser cortado. O limite atual já é de 20 chunks × comprimento completo, por isso continua melhor.
- **Sem biblioteca externa**: a serialização TOON implementada é simplificada (CSV-style, sem escape completo da spec). Para o uso de contexto em LLMs, isso é suficiente.

## Ordem de implementação

1. Adicionar funções `chunksToToon` e `compressOldHistory` em ambas as edge functions
2. Modificar `ai-process-message` para usar 5 mensagens recentes + contexto comprimido
3. Modificar `ai-playground` para usar TOON na base de conhecimento
4. Deploy e monitorizar `usage.total_tokens` nos logs para confirmar redução
