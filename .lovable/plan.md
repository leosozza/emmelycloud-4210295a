

# Adicionar Flows de Automação aos Robots de Cobrança e Contrato

## Resumo
Conectar os robots do Bitrix24 ao sistema de Flows, permitindo que após cada evento-chave (proposta aceita, contrato assinado, pagamento confirmado, pagamento atrasado) um flow específico seja executado automaticamente. O utilizador escolhe o flow numa lista dropdown no robot.

## Estado Atual
- **Gerar Proposta**: já tem `accept_flow_id` e funciona ao aceitar ✅
- **Gerar Contrato**: tem `accept_flow_id` no robot, mas o `sign-contract` **não dispara o flow** após assinatura ❌
- **Gerar Cobrança**: **não tem** campos de flow para pagamento confirmado ou atrasado ❌
- **Webhooks de pagamento** (Stripe/Asaas): não disparam flows ❌

## Plano de Implementação

### 1. DB Migration — novos campos na tabela `proposals`
Adicionar colunas para guardar os flow IDs configurados:
```sql
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS signed_flow_id TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS paid_flow_id TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS overdue_flow_id TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS overdue_days INTEGER DEFAULT 0;
```

E na tabela `payment_transactions`:
```sql
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS paid_flow_id TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS overdue_flow_id TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS overdue_days INTEGER DEFAULT 0;
```

### 2. Robot Registration (`bitrix24-install`)
- **emmely_generate_contract**: adicionar `signed_flow_id` (dropdown de flows) — flow ao assinar
- **emmely_create_charge**: adicionar 3 novos campos:
  - `paid_flow_id` — flow ao confirmar pagamento
  - `overdue_flow_id` — flow quando pagamento atrasa X dias
  - `overdue_days` — dias de atraso para disparar (default: 3)

### 3. Robot Handler (`bitrix24-robot-handler`)
- **handleGenerateContract**: guardar `signed_flow_id` na proposta (novo campo)
- **handleCreateCharge**: guardar `paid_flow_id`, `overdue_flow_id`, `overdue_days` nos metadados da transação de pagamento

### 4. Sign Contract (`sign-contract`)
Após assinatura bem-sucedida, verificar se `proposal.signed_flow_id` existe. Se sim, encontrar a conversa do cliente e disparar o flow via `flow-engine` (mesma lógica do `proposal-accept`).

### 5. Payment Webhooks (`payment-webhook-stripe` + `payment-webhook-asaas`)
Após pagamento confirmado, verificar se a transação tem `paid_flow_id` nos metadados. Se sim, encontrar a conversa do cliente via `proposal → case → lead → conversation` e disparar o flow.

### 6. Overdue Flow (Lógica de atraso)
Guardar `overdue_flow_id` e `overdue_days` nos metadados da transação. O `payment-reminder` (que já existe para cobranças) verificará se a transação está vencida há X dias e disparará o flow.

### Ficheiros a alterar
1. `supabase/functions/bitrix24-install/index.ts` — registar novos campos nos robots
2. `supabase/functions/bitrix24-robot-handler/index.ts` — guardar flow IDs
3. `supabase/functions/sign-contract/index.ts` — disparar `signed_flow_id`
4. `supabase/functions/payment-webhook-stripe/index.ts` — disparar `paid_flow_id`
5. `supabase/functions/payment-webhook-asaas/index.ts` — disparar `paid_flow_id`
6. `supabase/functions/payment-reminder/index.ts` — disparar `overdue_flow_id`
7. Migration SQL — novos campos nas tabelas

### Fluxo do Utilizador (exemplo)
1. No Bitrix24, configura robot "Gerar Proposta" → escolhe Flow A (ao aceitar)
2. Robot "Gerar Contrato" → escolhe Flow B (ao assinar)  
3. Robot "Gerar Cobrança" → escolhe Flow C (ao pagar) e Flow D (se atrasar 3 dias)
4. Cliente aceita proposta → Flow A executa (ex: mover etapa + gerar contrato)
5. Cliente assina contrato → Flow B executa (ex: enviar link de pagamento)
6. Cliente paga → Flow C executa (ex: mover etapa para "Ganho")
7. Cliente atrasa → Flow D executa (ex: enviar lembrete)

