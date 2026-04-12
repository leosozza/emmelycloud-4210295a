

# Atualizar Bitrix24App — Remover "Persona" e Adicionar Módulos em Falta

## Problema

A página `/bitrix24` ainda usa terminologia "Persona" em vez de "Agentes IA", e não inclui os módulos recentemente implementados (Automações IA, Observabilidade IA).

## Alterações no ficheiro `src/pages/Bitrix24App.tsx`

### 1. Renomear "Persona" para "Agentes IA"
- **Linha 207**: `label: "Persona"` → `label: "Agentes IA"`
- **Linha 1015**: `"Configurar Persona"` → `"Configurar Agente IA"`, desc: `"Acesse Agentes IA e selecione..."` 
- **Linha 1325**: `"Personas / Agentes IA"` → `"Agentes IA"`
- **Linha 1326**: desc → `"Configure e gerencie os seus agentes de IA"`

### 2. Adicionar novos módulos ao menu de navegação
Adicionar na categoria "Emmely IO":
- `{ id: "automacoes", label: "Automações IA", icon: Zap }`

Adicionar na categoria "Sistema":
- `{ id: "observabilidade", label: "Observabilidade", icon: Activity }`

### 3. Atualizar AppView type e validViews
- Adicionar `"automacoes"` e `"observabilidade"` ao type `AppView` (linha 83)
- Adicionar ambos ao array `validViews` (linha 98)

### 4. Adicionar renders dos novos módulos
Na secção `<main>` (linhas 317-352), adicionar:
- `{view === "automacoes" && <AutomacoesViewBitrix />}`
- `{view === "observabilidade" && <ObservabilidadeViewBitrix />}`

### 5. Criar componentes inline simplificados
- **AutomacoesViewBitrix**: Embed da página Automações existente via iframe ou componente minimalista que mostra os toggles das 4 automações (resumo, classificação, follow-up, sentimento) com os mesmos endpoints da edge function `ai-internal-automations`
- **ObservabilidadeViewBitrix**: Componente que mostra métricas de uso IA (chamadas, tokens, custos, erros) via query à tabela `ai_usage_logs`

## Ficheiros a alterar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Renomear Persona→Agentes IA, adicionar nav items, views e componentes inline |

