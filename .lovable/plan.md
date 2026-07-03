## Diagnóstico do deal 45807

Nos logs (`bitrix24_debug_logs`, evento `robot_emmely_create_charge_response` às 15:30):

```
returnValues.error = "Data do primeiro vencimento (UF_CRM_EMMELY_FIRST_DUE_DATE)"
charge_status    = "error"
```

O robot **foi disparado** e **abortou** por validação: considerou `firstDueDate` vazio. Não gerou link nem faturas.

### Por que aconteceu, mesmo com o utilizador "cadastrando certinho"

Existe uma **desconexão entre a UI Emmely Pay e o robot**:

1. Na aba **Emmely Pay** (screenshot), o utilizador configurou o plano (Entrada 5€ + Parcela 1/1 15€). Essa aba grava/lê a partir de `financial_records` (fonte de verdade do ciclo comercial, conforme a memória do projeto).
2. O robot chama `readEmmelyPaymentPlan()` (`supabase/functions/_shared/deal-payment-fields.ts`) que só lê `UF_CRM_EMMELY_FIRST_DUE_DATE` / `UF_CRM_EMMELY_NEXT_DUE_DATE` **direto do deal no Bitrix24**. Esses campos UF continuam vazios porque a UI não os escreve.
3. O BizProc mapeou `Data 1º Vencimento` como campo vazio (screenshot 2 confirma o input em branco) e `installments` também vazio. Sem fallback do plano, `firstDueDate = ""` → validação falha.

Além disso a Parcela 1/1 na UI mostra "Vencimento: Definir" e "Método: Definir" — a parcela em `financial_records` também está incompleta (só existe o registo da entrada, sem `due_date` do saldo).

### Por que o comentário no timeline não apareceu

O helper `postTimelineComment` foi chamado (a rota está no código), mas se `crm.timeline.comment.add` retorna erro (por exemplo `AUTHOR_ID: 1` inválido no portal, ou `ENTITY_TYPE` mal aceite), o helper apenas faz `console.warn` e não persiste em `bitrix24_debug_logs`. Não temos evidência de sucesso nem de falha da chamada.

---

## Plano

### 1. Fazer o robot enxergar o plano configurado na UI (`financial_records`)

Em `supabase/functions/_shared/deal-payment-fields.ts` → `readEmmelyPaymentPlan()`:

- Depois de ler os campos UF do deal, se `firstDue` ou `remainingMethod` ou `remainingInstallments` ou `totalAmount` estiverem vazios/zerados, carregar de `financial_records where bitrix24_deal_id = dealId order by installment_number`:
  - `totalAmount` ← soma de `installment_value` (quando o UF `TOTAL_AMOUNT` estiver vazio).
  - `firstDue` ← menor `due_date` entre parcelas com `status = 'pendente'` que **não** sejam a entrada.
  - `remainingInstallments` ← contagem das parcelas pendentes de saldo.
  - `remainingMethod` ← método mais frequente entre as parcelas pendentes (fallback `card`).
  - `downPayment` / `downFirstDue` / `downMethod` ← primeira parcela marcada como entrada (heurística: `installment_number = 1` e `total_installments > 1` com valor < total — se o esquema não tiver flag, deixamos como está).
- Adicionar em `plan.warnings` origem (`"firstDue from financial_records"`) para debug.

### 2. Mensagem de validação mais útil

Em `handleCreateCharge` (`supabase/functions/bitrix24-robot-handler/index.ts`):

- Além dos 3 checks atuais, iterar `financial_records` do deal e listar parcelas com `due_date IS NULL` ou `payment_method IS NULL/''` — juntar na lista `missing` (ex.: `"Parcela 1/1: falta data de vencimento e método"`).
- Manter o comentário `[B]⚠️ Emmely Pay — não foi possível gerar o link[/B]` com a lista consolidada.

### 3. Garantir que o comentário no timeline chega ao utilizador

Em `postTimelineComment`:

- Persistir o resultado em `bitrix24_debug_logs` (evento `timeline_comment_add`, `direction: "outbound"`) com o `error` do Bitrix quando existir — assim conseguimos diagnosticar falhas silenciosas.
- Se a resposta trouxer erro, tentar **um retry** trocando `AUTHOR_ID` para o `responsible_id` do próprio deal (buscar via `crm.deal.get`) — evita rejeição por AUTHOR_ID inválido em alguns portais.
- Fallback final: usar `crm.activity.add` com um provider próprio (comentário simples) se `crm.timeline.comment.add` continuar a falhar, garantindo visibilidade no timeline.

### 4. (opcional/segurança) Escrever o plano de volta no deal

Quando `readEmmelyPaymentPlan` reconstruir o plano a partir de `financial_records`, atualizar em best-effort os campos `UF_CRM_EMMELY_FIRST_DUE_DATE`, `UF_CRM_EMMELY_TOTAL_AMOUNT`, `UF_CRM_EMMELY_PAYMENT_METHOD` no deal (via `crm.deal.update`) para manter consistência entre UI e Bitrix. Isso evita que próximas execuções voltem a cair no fallback.

### 5. Validação

1. Reprocessar deal 45807 (com `financial_records` incompleto): esperar comentário no timeline listando "Parcela 1/1: falta data de vencimento e método" e `bitrix24_debug_logs` a registar `timeline_comment_add` com/sem erro.
2. Completar `due_date` + `payment_method` da parcela via UI Emmely Pay → mover o deal para "Gerar link Pagamento" → esperar comentário `✅ Emmely Pay — link gerado` com URL clicável.
3. Confirmar que os UF do deal foram atualizados após a execução bem-sucedida (passo 4).

## Arquivos alterados

- `supabase/functions/_shared/deal-payment-fields.ts` (fallback `financial_records`, escrita opcional de UF)
- `supabase/functions/bitrix24-robot-handler/index.ts` (validação por parcela, `postTimelineComment` com log/retry/fallback)

Sem alterações em UI, `bitrix24-payment-tab` nem `payment-create-link`.
