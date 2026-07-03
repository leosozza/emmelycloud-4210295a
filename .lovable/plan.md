## Diagnóstico do deal 45807

Os logs mostram que o robot rodou, chamou `payment-create` para as 2 parcelas e ambas devolveram sem `transaction.id` — daí `gateway_used=""`, `payment_url=""`, `invoices_created="0"` e o campo `UF_CRM_EMMELY_PAYMENT_URL` não foi preenchido (o `crm.deal.update` só corre quando existe `firstPaymentUrl`).

Causa mais provável: o `customer_email` recebido do Bitrix24 é **`"ailson.franca@outlook.com, cordeirothalita10@gmail.com"`** (dois emails separados por vírgula). A Stripe rejeita esse formato ao criar a Checkout Session, `payment-create` faz `throw`, devolve `{ error: ... }` sem `transaction`, e o robot ignora silenciosamente. Sem `payment_url`, a automação de envio ao cliente também não dispara porque `UF_CRM_EMMELY_PAYMENT_URL` fica vazio.

## Alterações propostas

**1. `supabase/functions/bitrix24-robot-handler/index.ts` — `handleCreateCharge`**
- Sanitizar `customerEmail`: aceitar apenas o primeiro email válido (`split(/[,;\s]+/)` → primeiro que passa numa regex simples). Se depois de sanitizar ficar inválido, adicionar a `missing` como `Email do cliente — formato inválido`.
- Sanitizar `customerName` (trim, limite de tamanho).
- No loop de parcelas capturar a resposta completa de `payment-create`:
  - Se `!res.ok` ou `!data.transaction?.id`, registar em `bitrix24_debug_logs` (`event_type: payment_create_failed`, com deal, parcela, HTTP status e `data.error`).
  - Acumular em `parcelErrors: string[]` (ex.: `Entrada 1/1: <mensagem>`).
- Postar comentário `❌ Emmely Pay — falha ao criar cobrança(s)` com a lista de erros e devolver `charge_status: "error"` quando nenhuma parcela produziu link. Só postar o `✅ … link gerado` quando existir pelo menos um `payment_url`.
- **Garantir preenchimento de `UF_CRM_EMMELY_PAYMENT_URL`** (bloco `crm.deal.update`): manter a escrita atual e adicionar:
  - Registo em `bitrix24_debug_logs` (`event_type: deal_update_payment_url`) com o resultado da chamada, para termos evidência de que o campo foi gravado.
  - Se `crm.deal.update` devolver `error`, refazer a tentativa uma vez e, se voltar a falhar, incluir o aviso `⚠️ Link gerado mas UF_CRM_EMMELY_PAYMENT_URL não foi atualizado` no comentário de sucesso, para a automação de envio ao cliente ser corrigida manualmente.
  - Continuar a gravar `UF_CRM_EMMELY_GATEWAY` no mesmo update.

**2. `supabase/functions/payment-create/index.ts`**
- Validar `customer_data.email` com regex antes de chamar `createStripePayment`; se inválido, devolver 400 com `Email do cliente inválido: "<valor>"`.
- `console.error` do corpo devolvido pela Stripe quando a chamada falha, para termos rasto nos logs da função.

**3. Validação**
- Reprocessar deal 45807 com o email atual (com vírgula) → deve aparecer `❌ falha ao criar cobrança` com "Email do cliente inválido" e nada gravado em `UF_CRM_EMMELY_PAYMENT_URL`.
- Corrigir o email do contacto (deixar só um) e reprocessar → comentário `✅ link gerado`, `UF_CRM_EMMELY_PAYMENT_URL` preenchido (confirmar via `crm.deal.get` e no debug log `deal_update_payment_url`) e `Faturas Bitrix24 criadas: 2`.

Alterações restritas às duas Edge Functions acima; sem mudanças de UI ou de outros fluxos.