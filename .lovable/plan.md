

# Corrigir Erros de Build — 5 Correções

## Problema
Existem 5 erros de TypeScript que impedem o build.

## Correções

### 1. `supabase/functions/ai-process-message/index.ts` (linha 753)
`linkedDocs` tem tipo `{document_id: any}[] | null` mas a função espera `any[]`.
**Fix**: Adicionar `|| []` — `linkedDocs || []`

### 2. `supabase/functions/report-agent/index.ts` (linha 125)
`err` é do tipo `unknown`.
**Fix**: `(err as any).message`

### 3. `supabase/functions/simulation-engine/index.ts` (linha 127)
`e` é do tipo `unknown`.
**Fix**: `(e as any).message`

### 4. `src/pages/Simulation.tsx` (linha 98)
Propriedade `title` não existe no tipo de ícone Lucide.
**Fix**: Remover `title` e usar um wrapper `<span title="...">` ou simplesmente removê-lo.

### 5. `src/pages/Simulation.tsx` (linha 210)
`intervention_prompt` não existe no tipo `simulations.Update`.
**Fix**: Cast para `as any` no update, ou adicionar migração para adicionar a coluna.

### 6. `src/components/flows/NodeConfigPanel.tsx` (linhas 100-101)
`ai_crews` não existe como tabela no schema.
**Fix**: Adicionar migração para criar a tabela `ai_crews` (que já é referenciada pelo `ai-crew-executor` edge function), OU comentar/remover o query temporariamente e usar dados mock.

## Abordagem Recomendada

Dado que o plano do utilizador já prevê a criação das tabelas `ai_crews` e `ai_tasks`, a abordagem mais limpa é:

1. **Criar migração** para adicionar `current_round` e `intervention_prompt` à tabela `simulations`
2. **Criar migração** para as tabelas `ai_crews`, `ai_tasks`, `ai_task_executions` (necessárias pelo edge function `ai-crew-executor` e pelo `NodeConfigPanel`)
3. **Corrigir os 3 erros de tipo** nos edge functions (casts simples)
4. **Corrigir o ícone Lucide** em `Simulation.tsx`

## Ficheiros a alterar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/ai-process-message/index.ts` | `linkedDocs || []` na linha 753 |
| `supabase/functions/report-agent/index.ts` | `(err as any).message` na linha 125 |
| `supabase/functions/simulation-engine/index.ts` | `(e as any).message` na linha 127 |
| `src/pages/Simulation.tsx` | Remover `title` do Zap icon; cast `as any` no update |
| Migração SQL | Adicionar `current_round int`, `intervention_prompt text` a `simulations`; criar `ai_crews`, `ai_tasks`, `ai_task_executions` |

