## Problema

Ao gerar cobrança, o comentário postado na timeline do negócio no Bitrix24 diz:

> Parcelas: 3 (entrada 5,00 € + 2x)

Mas o placement "Emmely Pay" mostra apenas 2 linhas: **Entrada 5,00 €** + **Parcela 1/1 15,00 €**. As faturas realmente criadas também são 2 (não 3).

## Causa

Em `supabase/functions/bitrix24-robot-handler/index.ts` (linha 1039), o texto do comentário usa as variáveis de **input** (`totalCount`, `downPayment`, `numInstallments`) — e `numInstallments` vem direto dos campos do deal antes de o `planToParcels()` normalizar (pode ficar diferente do que foi realmente criado: por ex., se o valor restante não divide, se `remainingInstallments` é ignorado, se a soma bate certa com 1 parcela só, etc.).

Todo o resto do fluxo (loop `for (const parcel of parcels)`, faturas Bitrix, `total_installments`) já usa `parcels` como fonte da verdade. Só o texto do comentário ficou desatualizado.

## Correção

Substituir a linha do resumo para derivar os números diretamente do array `parcels` que foi efetivamente processado:

```ts
const downParcels = parcels.filter(p => p.is_down_payment);
const remainingParcels = parcels.filter(p => !p.is_down_payment);
const downSum = downParcels.reduce((s, p) => s + p.amount, 0);

// linha do resumo
`Parcelas: ${parcels.length}` +
  (downParcels.length > 0
    ? ` (entrada ${fmt(downSum)}${downParcels.length > 1 ? ` em ${downParcels.length}x` : ""}` +
      (remainingParcels.length > 0 ? ` + ${remainingParcels.length}x de ${fmt(remainingParcels[0].amount)}` : "") +
      `)`
    : ` de ${fmt(remainingParcels[0]?.amount || 0)}`)
```

Isto garante que o texto reflete exatamente o que o placement e as faturas mostram.

## Ficheiros afetados

- `supabase/functions/bitrix24-robot-handler/index.ts` — apenas a construção do `comment` no bloco "post friendly summary" (~linhas 1020–1042).

Nenhuma outra lógica é alterada (cálculo de parcelas, criação de faturas, reuse/recreate continuam iguais).
