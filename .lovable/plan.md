
## Problema

No deal 45807, o utilizador definiu:
- Entrada: 1 parcela
- Saldo: 1 parcela

Total esperado = 2 faturas. Mas o Emmely Pay gerou 3 (entrada + 2×5,00 €).

## Causa

Em `supabase/functions/_shared/deal-payment-fields.ts` (linha ~225), o fallback trata o valor `1` como "não definido":

```ts
if (!remainingInstallments || remainingInstallments === 1) {
  const maxTot = frData.reduce((m, r) => Math.max(m, intNum(r.total_installments, 0)), 0);
  if (maxTot > 0) effRemainingInstallments = maxTot;
  else if (pendingOrAll.length > 0) effRemainingInstallments = pendingOrAll.length;
}
```

Quando o utilizador altera o plano de 2→1 parcela e regenera o link, o `financial_records` ainda tem as parcelas antigas com `total_installments = 2`, e o fallback sobrescreve o valor correto (1) por 2. Resultado: 1 entrada + 2 parcelas do saldo = 3 faturas.

O mesmo padrão ocorre implicitamente com `intNum(pick("UF_CRM_EMMELY_TOTAL_INSTALLMENTS"), 1)` — que não distingue "campo vazio" de "campo = 1".

## Correção

Em `supabase/functions/_shared/deal-payment-fields.ts`:

1. Detectar explicitamente se `UF_CRM_EMMELY_TOTAL_INSTALLMENTS` está presente no deal (não-nulo, não-vazio). Guardar em `remainingInstallmentsExplicit: boolean`.
2. Só ativar o fallback de `financial_records` para `remainingInstallments` quando **não** for explícito. Ou seja, mudar a condição para `if (!remainingInstallmentsExplicit)`.
3. Aplicar o mesmo tratamento explícito a `UF_CRM_EMMELY_DOWN_INSTALLMENTS` (por consistência, embora o bug reportado seja no saldo).
4. Registar em `warnings` quando o fallback for aplicado, para observabilidade.

Nada mais é alterado — `planToParcels` e o robot handler continuam iguais.

## Verificação

Após deploy, gerar novo link no deal 45807 com `Nº DE PARCELAS = 1`. Timeline deve mostrar `Parcelas: 2 (entrada 10,00 € + 1x de 10,00 €)` e criar 2 faturas Bitrix24.
