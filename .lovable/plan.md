

# Executar 8 Migrações SQL — EmmelyCloud

## Resumo

Executar 8 migrações SQL na ordem correcta para implementar: pagamento automático em propostas, user_memory omnichannel, persona trainer melhorado, queue worker com SKIP LOCKED, AI sessions, cost tracker, history compactor e audit logs.

## Migrações (por ordem de dependências FK)

| # | Tabela/Função | Tipo |
|---|---|---|
| 1 | `proposals.auto_payment_config` | Nova coluna JSONB |
| 2 | `user_memory` — fix constraint + omnichannel + `upsert_user_memory()` RPC | ALTER + nova função |
| 3 | `persona_training_history` + `ai_agents.base_prompt` | Novas colunas |
| 4 | `message_queue` + `claim_queue_jobs()` + `release_stuck_jobs()` | ALTER + RPCs |
| 5 | `ai_sessions` + `timeout_inactive_sessions()` | Nova tabela + RPC |
| 6 | `ai_usage_logs.session_id` + `ai_agents.monthly_budget_usd` + `get_monthly_cost_by_agent()` | ALTER + RPC (depende de #5) |
| 7 | `conversation_summaries` + cleanup trigger | Nova tabela |
| 8 | `ai_audit_logs` + cleanup trigger | Nova tabela |

## Implementação

Executar cada migração como um ficheiro SQL separado via ferramenta de migração, na ordem 1→8. Todas usam `IF NOT EXISTS` / `IF EXISTS` para serem idempotentes.

A migração 3 inclui um `UPDATE` para copiar `system_prompt` → `base_prompt` nos agentes existentes — isto será executado dentro da migração (é seguro pois é parte da mesma DDL de setup).

## Nota sobre CHECK constraint (Migração 5)

A tabela `ai_sessions` usa `CHECK (status IN (...))` que é imutável e seguro neste caso (não depende de `now()`). Não há necessidade de trigger de validação aqui.

## Ficheiros a criar

8 ficheiros de migração SQL em `supabase/migrations/`

