
## Problema

Vários campos `UF_CRM_EMMELY_*` de valor monetário foram criados no Bitrix24 como **integer**, então não aceitam centavos. Precisam virar tipo **money** (formata moeda + aceita decimais + símbolo). A API do Bitrix **não permite alterar `USER_TYPE_ID`** de um campo existente — a única forma é deletar e recriar. Precisamos preservar os valores atuais.

## Campos afetados (Deal)

Monetários que devem ser `money`:
- `UF_CRM_EMMELY_TOTAL_AMOUNT` — Valor total da cobrança
- `UF_CRM_EMMELY_DOWN_PAYMENT` — Valor de entrada
- `UF_CRM_EMMELY_REMAINING_BALANCE` — Saldo a parcelar
- `UF_CRM_EMMELY_INSTALLMENT_VALUE` — Valor da parcela
- `UF_CRM_EMMELY_TOTAL_PAID` — Total pago

(Campos como `DOWN_INSTALLMENTS`, `TOTAL_INSTALLMENTS`, `PAID_INSTALLMENTS`, `INSTALLMENT_INTERVAL`, `DOWN_INTERVAL` continuam como integer/enumeration — corretos.)

Confirmar se algum outro deve entrar (ex.: SPA Ação Judicial já usa `money` para `VALOR_CONDENACAO`, ok).

## Estratégia

Nova Edge Function `bitrix24-repair-money-fields` (invocada manualmente pelo admin), que para cada campo da lista acima:

1. `crm.deal.userfield.list` → localiza o field pelo `FIELD_NAME` e lê `USER_TYPE_ID`.
2. Se já for `money`, pula.
3. Se for `integer`/`double`/`string`:
   a. Faz `crm.deal.list` paginado (start/next), pegando `ID` + valor atual do campo (apenas deals com valor ≠ vazio / ≠ 0). Guarda em memória `Map<dealId, value>`.
   b. `crm.deal.userfield.delete` do campo antigo.
   c. `crm.deal.userfield.add` recriando com `USER_TYPE_ID: "money"`, mesmos labels, `SORT`, `SETTINGS: { DEFAULT_VALUE: "", SIZE: 20, PRECISION: 2 }` e código idêntico.
   d. Restaura valores: para cada deal salvo, `crm.deal.update` com o novo valor (Bitrix aceita `"12.34|EUR"` — usa a `CURRENCY_ID` do próprio deal como sufixo, com fallback `EUR`).
4. Devolve resumo `{ field, oldType, newType, restored, failed }`.

Também atualiza `bitrix24-install/index.ts` para criar esses 5 campos já como `money` em instalações futuras, mantendo `PRECISION: 2`.

## Considerações

- Money no Bitrix24 é armazenado como string `"valor|MOEDA"` (ex.: `"20.00|EUR"`). O leitor `num()` em `_shared/deal-payment-fields.ts` já faz `parseFloat` com replace de vírgula, mas precisa tolerar o sufixo `|EUR` — pequena adaptação no `num()` para cortar após `|`.
- Function idempotente: se o campo já for money, não faz nada.
- Executada sob demanda via chamada HTTP autenticada (service role) — não roda no install padrão para evitar remoção acidental de dados em produções antigas.
- Paginação com `start` de 50 em 50 até esvaziar (padrão Bitrix); rate-limit tolerado via pequeno delay entre updates.

## Arquivos alterados

- `supabase/functions/bitrix24-repair-money-fields/index.ts` (novo)
- `supabase/functions/bitrix24-install/index.ts` — trocar `USER_TYPE_ID: "double"` para `"money"` + `SETTINGS: { PRECISION: 2 }` nos 5 campos acima (dois blocos, linhas ~591/638/743/747/767 e ~1601/1648/1753/1757/1777).
- `supabase/functions/_shared/deal-payment-fields.ts` — helper `num()` passa a cortar `|MOEDA` antes de parsear.

## Passo do usuário

Depois do deploy, chamar a função uma vez a partir do painel (adiciono um botão em Configurações → Bitrix24 → "Corrigir campos monetários") para migrar o portal atual.
