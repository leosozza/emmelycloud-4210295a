

## Diagnóstico

O regex `/payment method type "?([a-z_]+)"?/i` captura a palavra `provided` na frase `"The payment method type provided: sepa_debit is invalid"` em vez de `sepa_debit`. Resultado:
- Mensagem ao utilizador mostra "provided" (não é um método real).
- O método real (`sepa_debit`) não é adicionado à lista `INACTIVE_METHODS`, logo o retry tenta-o de novo → loop até esgotar tentativas.

## Plano

### Fix em `payment-create-link/index.ts` — função `extractOffendingMethod`

Substituir o regex único por uma cascata que tenta primeiro padrões específicos do Stripe e só usa o genérico como último recurso:

```ts
function extractOffendingMethod(msg: string): string | null {
  // Padrão 1: "type provided: sepa_debit is invalid"
  let m = msg.match(/type provided:\s*([a-z_]+)/i);
  if (m) return m[1];
  // Padrão 2: "payment method type "card" is not activated"
  m = msg.match(/payment method type "([a-z_]+)"/i);
  if (m) return m[1];
  // Padrão 3: "payment_method_types[2]: sepa_debit"
  m = msg.match(/payment_method_types\[\d+\]:\s*([a-z_]+)/i);
  if (m) return m[1];
  // Fallback: primeira palavra após "type" que pareça um método (ignora "provided")
  m = msg.match(/type[^a-z_]+([a-z]+_[a-z_]+)/i);
  if (m) return m[1];
  return null;
}
```

Com isto:
- `sepa_debit` é corretamente identificado e marcado como inativo.
- O retry remove-o e tenta o próximo método (`multibanco` ou `mb_way`).
- Se todos falharem, mensagem final lista o método real, não "provided".

### Verificação

Re-testar token `ac511cda-…` clicando em **SEPA** — deve agora cair automaticamente para outro método sem erro, ou devolver mensagem clara identificando `sepa_debit` como inativo.

## Ficheiro afetado

- `supabase/functions/payment-create-link/index.ts` (apenas a função `extractOffendingMethod`).

