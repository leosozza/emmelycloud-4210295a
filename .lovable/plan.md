

## Cobranças Automáticas — Plano de Implementação

### 1. Nova Edge Function `payment-reminder`
Função que busca `financial_records` com `status = 'pendente'` e `due_date` nos próximos 3 dias, no dia, ou vencidos. Para cada parcela:
- Busca o contrato → proposta → caso → lead → `conversation_id` e dados do cliente
- Chama `payment-create` para gerar link de pagamento (se ainda não existe `payment_transaction` para aquele `financial_record_id`)
- Monta mensagem personalizada com nome, valor, vencimento e link
- Envia via `message-send` na conversa do cliente
- Registra `metadata.reminder_sent_at` na transaction para evitar reenvios

Suporta dois modos:
- **POST `{ mode: "cron" }`**: processa todos os pendentes (chamada pelo CRON)
- **POST `{ mode: "manual", financial_record_id }`**: envia cobrança manual de uma parcela específica

### 2. CRON Job via pg_cron + pg_net
Executar SQL (via insert tool, não migration) para criar job diário às 9h:
```sql
SELECT cron.schedule('payment-reminder-daily', '0 9 * * *', $$
  SELECT net.http_post(
    url:='https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-reminder',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{"mode":"cron"}'::jsonb
  ) as request_id;
$$);
```

### 3. Config
Adicionar `[functions.payment-reminder] verify_jwt = false` ao `config.toml`.

### 4. Frontend — Página Financeiro
- Adicionar coluna "Ações" na tabela com botão "Enviar Cobrança" por parcela pendente
- Botão chama `supabase.functions.invoke('payment-reminder', { body: { mode: 'manual', financial_record_id: tx.financial_record_id } })`
- Novo KPI card "Cobranças Enviadas" que conta `payment_transactions` com `metadata->reminder_sent_at IS NOT NULL` no período

### 5. Habilitar extensões pg_cron e pg_net
Migração para garantir que as extensões estão ativas:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

### Ficheiros a Criar/Modificar
| Ficheiro | Ação |
|---|---|
| `supabase/functions/payment-reminder/index.ts` | Criar |
| `supabase/config.toml` | Editar — adicionar payment-reminder |
| `src/pages/Financeiro.tsx` | Editar — botão manual + KPI cobranças |
| Migration SQL | Extensões pg_cron + pg_net |
| Insert SQL | CRON job schedule |

