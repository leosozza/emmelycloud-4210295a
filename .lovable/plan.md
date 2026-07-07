## Diagnóstico
O relatório usa parcelas sintéticas com IDs no formato `synthetic-{dealId}-{d|r}{n}` (ver `_shared/deal-payment-fields.ts:405`), por exemplo `synthetic-12345-d1` (entrada) ou `synthetic-12345-r2` (parcela recorrente 2).

O `payment-create-link` (linhas 166-179) faz:
```ts
const installmentNumber = parseInt(parts[2] || "1", 10);
```
Como `parts[2]` é `"d1"` ou `"r2"`, o `parseInt` retorna `NaN` → devolve `"Synthetic ID inválido"`. Daí o erro visto pelo utilizador.

Adicionalmente, quando materializa em `financial_records`, ignora o flag de entrada (down payment), então uma entrada + parcelas com o mesmo `installment_number=1` colidem/confundem-se.

## Alteração

### `supabase/functions/payment-create-link/index.ts` (bloco `if (isSynthetic)`, linhas 168-179 e uso subsequente)

1. **Parsing correto do ID sintético.** Substituir o parse por regex que reconhece o prefixo `d`/`r`:
   ```ts
   const m = /^([dr])(\d+)$/i.exec(parts[2] || "");
   const isDownPayment = m?.[1]?.toLowerCase() === "d";
   const installmentNumber = m ? parseInt(m[2], 10) : parseInt(parts[2] || "1", 10);
   ```
   Manter fallback para IDs antigos sem prefixo. Continuar validando `dealIdNum` e `installmentNumber` finitos.

2. **Lookup considerando entrada vs. parcela.** No `select` de `financial_records` (linhas 189-194), adicionar filtro por descrição/flag para distinguir entrada de parcela regular com o mesmo `installment_number`. Estratégia mínima: filtrar por `description` que começa com `"Entrada"` quando `isDownPayment`, ou `not.ilike "Entrada%"` caso contrário. (Sem alteração de schema.)

3. **Descrição correta ao materializar.** No `insert` (linhas 282-295), quando `isDownPayment`, gravar `description: "Entrada"` (e manter `installment_number: 1` como já é). Caso contrário, manter comportamento atual (`Parcela X/Y`).

4. **Log de diagnóstico.** Adicionar `console.log("[PAYMENT-CREATE-LINK] synthetic parse:", { financial_record_id, dealIdNum, installmentNumber, isDownPayment })` antes do lookup, para futura depuração.

### Escopo
- Só backend, apenas `payment-create-link/index.ts`.
- Não alterar `PagamentoPublico.tsx`, `payment-receipt`, `deal-payment-fields.ts`, nem o formato dos IDs sintéticos (usados em muitos outros pontos).
- Sem migração de banco.

## Validação
1. Abrir `https://emmelycloud.pages.dev/pagamento/799e3b72-833b-49b2-8c34-115f6852b7c1`, clicar "Pagar" numa parcela.
2. Esperado: link Stripe gerado (ou fallback correspondente), sem erro "Synthetic ID inválido".
3. Verificar em `financial_records` que uma linha foi criada com `bitrix24_deal_id` correto e `description` "Entrada" ou "Parcela n/N" conforme o caso.
