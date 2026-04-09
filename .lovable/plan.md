

# Aplicar Melhorias do Relatório Estratégico — Todas as Fases

## Resumo

As **migrações SQL** e **edge functions** já existem. O trabalho principal é ligar o frontend às novas capacidades: `base_prompt`, `monthly_budget_usd`, sessões IA, audit logs, conversation summaries, e melhorar a observabilidade.

## Fase 1 — Fundação (Frontend para infra existente)

### 1.1 Agentes: campos `base_prompt` e `monthly_budget_usd`
- **`src/pages/Agentes.tsx`** — Adicionar `base_prompt` e `monthly_budget_usd` ao `AIAgent` interface e `defaultAgent`
- **`src/components/agentes/AgentFormDialog.tsx`** — Novo campo "Prompt Base (Persona)" (Textarea) separado do system_prompt + campo "Budget Mensal (USD)" (Input number). O `base_prompt` é o prompt gerado pelo persona trainer, enquanto o `system_prompt` são instruções manuais

### 1.2 Observabilidade: sessões + audit logs + summaries
- **`src/pages/ObservabilidadeIA.tsx`** — Expandir com 3 novas tabs:
  - **Sessões**: tabela de `ai_sessions` com status, turns, latência, custo
  - **Audit Logs**: tabela de `ai_audit_logs` com acções e detalhes
  - **Summaries**: tabela de `conversation_summaries` com resumos gerados
- **`src/hooks/useAiObservability.ts`** — Adicionar queries para `ai_sessions`, `ai_audit_logs`, `conversation_summaries`

### 1.3 Observabilidade: alertas de budget
- Na tab "Por Agente" da observabilidade, mostrar `monthly_budget_usd` vs custo actual com barra de progresso e badge de alerta (>80% amarelo, >100% vermelho)

## Fase 2 — Inteligência

### 2.1 Auto-payment em propostas
- **`src/pages/PropostaPublica.tsx`** — Após aceite, se `auto_payment_config` está configurado na proposta, redirigir automaticamente para pagamento
- **`src/components/propostas/PropostaForm.tsx`** — Adicionar secção "Pagamento Automático" com toggle e configuração (gateway, parcelamento)

### 2.2 Persona Trainer melhorado
- O `AgentTrainingChat.tsx` já usa `persona_training_history` — verificar se funciona com a nova coluna `base_prompt` e actualizar para gravar em `base_prompt` em vez de `system_prompt`

### 2.3 User Memory omnichannel
- Já funciona via RPC `upsert_user_memory` — sem alteração frontend necessária (o backend já usa nos webhooks)

## Fase 3 — Escala

### 3.1 Dashboard de custos por agente (RPC existente)
- **`src/pages/ObservabilidadeIA.tsx`** — Na tab "Por Agente", chamar `get_monthly_cost_by_agent` para cada agente e mostrar custo vs budget com gráfico

### 3.2 Health check (Parity Audit)
- Já existe no PlaygroundIA — mover/duplicar para a observabilidade como tab "Saúde do Sistema"

## Ficheiros a editar

1. **`src/pages/Agentes.tsx`** — interface + defaults (base_prompt, monthly_budget_usd)
2. **`src/components/agentes/AgentFormDialog.tsx`** — 2 novos campos no formulário
3. **`src/pages/ObservabilidadeIA.tsx`** — tabs para sessões, audit logs, summaries, budget alerts, health check
4. **`src/hooks/useAiObservability.ts`** — queries adicionais
5. **`src/components/propostas/PropostaForm.tsx`** — secção auto-payment config
6. **`src/pages/PropostaPublica.tsx`** — lógica de auto-redirect após aceite
7. **`src/components/agentes/AgentTrainingChat.tsx`** — usar base_prompt

