## Plano

Corrigir o ramo de reutilização do `bitrix24-robot-handler`, que ainda monta a mensagem com `Parcelas: ${parcels.length}`.

## Alterações propostas

1. No bloco de detecção de reutilização, guardar as transações do grupo existente que será reutilizado.
2. Quando `reuseDecision === "reuse"`, montar o resumo a partir do grupo existente reutilizado, não do plano recalculado do deal.
3. Substituir a linha atual:

```ts
Parcelas: ${parcels.length}
```

por um resumo derivado das parcelas/transações realmente existentes, com fallback seguro para o resumo calculado só se não houver dados do grupo antigo.
4. Manter o restante do fluxo sem alterações: não recriar links, não recriar faturas, não alterar cálculo de parcelas.

## Resultado esperado

Se o placement mostra 2 parcelas e o link reutilizado corresponde a esse grupo existente, o comentário na timeline passará a mostrar `Parcelas: 2` em vez de `Parcelas: 3`.