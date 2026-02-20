

# Remover todas as referências visíveis a "Lovable"

## Problema

Existem 3 locais onde o nome "lovable" aparece visível ao utilizador:

1. **Playground IA** (`src/pages/PlaygroundIA.tsx`, linha 170) — O badge do Provider mostra o slug técnico (`ai_provider`) diretamente, ou seja, "lovable" em vez de "Emmely AI" ou "nativo"
2. **Card do Agente** (`src/components/agentes/AgentCard.tsx`, linha 50) — O fallback `agent.ai_provider` pode mostrar "lovable" se o lookup do provider falhar
3. **Meta tag Twitter** (`index.html`, linha 18) — `twitter:site` está definido como `@Lovable`

## Correções

### 1. PlaygroundIA.tsx — Resolver nome do provider

Carregar a lista de providers da base de dados (como já acontece na página Agentes) e mostrar o nome real em vez do slug. Se o slug for "lovable", mostrar "nativo".

```
// Antes:
<Badge>{selectedAgent.ai_provider}</Badge>

// Depois: 
<Badge>{providerName || "nativo"}</Badge>
```

Isto requer adicionar um query para buscar os providers, tal como já é feito em `Agentes.tsx`.

### 2. AgentCard.tsx — Melhorar fallback

Alterar o fallback para nunca mostrar o slug "lovable":

```
// Antes:
{textProvider?.name || agent.ai_provider}

// Depois:
{textProvider?.name || (agent.ai_provider === "lovable" ? "nativo" : agent.ai_provider)}
```

### 3. index.html — Corrigir meta tag

Alterar `@Lovable` para `@EmmelyAI` (ou remover a referência):

```html
<meta name="twitter:site" content="@EmmelyAI" />
```

## Ficheiros a modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/pages/PlaygroundIA.tsx` | Carregar providers e mostrar nome em vez de slug |
| `src/components/agentes/AgentCard.tsx` | Fallback "nativo" quando slug = "lovable" |
| `index.html` | twitter:site → `@EmmelyAI` |

