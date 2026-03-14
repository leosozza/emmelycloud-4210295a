

## Plano: Completar as 7 Correcções do Fluxo de Propostas + Notificações

### Estado Actual

A maioria das correcções **já foi implementada** na mensagem anterior:
- ✅ Lógica centralizada no `proposal-accept` Edge Function (com IP/user-agent)
- ✅ Notificações internas a admins e advogados
- ✅ Sanitização XSS no `proposal-pdf`
- ✅ Prevenção de casos fantasma no Bitrix24 robot handler
- ✅ URL dinâmica via `FRONTEND_URL`
- ✅ Checkbox de confirmação legal na página pública

### O que FALTA implementar

| # | Item | Detalhe |
|---|------|---------|
| 1 | **`proposal-accept` sem `verify_jwt = false`** | O config.toml não inclui esta entry — a função rejeita chamadas do frontend público (anon) | 
| 2 | **pg_cron para expiração automática** | Nenhum job existe para marcar propostas expiradas. Criar via SQL insert (não migration, pois contém dados específicos do projecto) |
| 3 | **Confirmação por email ao cliente** | Quando o cliente aceita, enviar email de confirmação. Não há infra de email transaccional configurada — implementar via WhatsApp (se conversa existir) ou logar para envio manual |

### Implementação

**1. Configurar `proposal-accept` no config.toml**
- Adicionar `[functions.proposal-accept]` com `verify_jwt = false` para permitir chamadas públicas.

**2. Criar pg_cron job para expiração automática**
- Habilitar extensões `pg_cron` e `pg_net` via migration.
- Criar cron job via SQL insert que executa `UPDATE proposals SET status = 'expirada' WHERE valid_until < now() AND status = 'enviada'` a cada 6 horas.

**3. Notificação ao cliente após aceite**
- Como não há infraestrutura de email transaccional configurada, a abordagem será:
  - Adicionar no `proposal-accept` uma tentativa de envio via WhatsApp/Instagram (se existir conversa vinculada ao caso/lead).
  - Logar a acção de aceite no `bitrix24_debug_logs` para rastreabilidade.
  - Notificar especificamente o advogado atribuído ao caso (não apenas todos os advogados).

**4. Melhorias adicionais no `proposal-accept`**
- Notificar o advogado atribuído ao caso (`assigned_attorney_id`) além dos admins genéricos.
- Adicionar log de aceite nos debug logs para auditoria.

### Ficheiros a modificar

- `supabase/config.toml` — adicionar entry para `proposal-accept`
- `supabase/functions/proposal-accept/index.ts` — notificação dirigida ao advogado do caso + log de auditoria + tentativa de mensagem ao cliente via canal existente
- Migration SQL — habilitar `pg_cron`/`pg_net`
- SQL insert (via insert tool) — criar o cron job de expiração

