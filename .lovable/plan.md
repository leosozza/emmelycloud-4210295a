
## O que muda

Concordo — como é one-shot e idempotente, não precisa de botão.

## Ações

1. **Executar agora** a `bitrix24-repair-money-fields` (chamada única do meu lado) para migrar os campos do portal atual. A função já está deployada e o dry-run mostrou os 5 campos como `double` prontos para conversão (~100 linhas a restaurar no total).

2. **Remover o botão** "Corrigir campos monetários" e o handler `handleRepairMoneyFields` de `src/pages/Integracoes.tsx` (estado `repairingMoney` também sai).

3. **Encadear no fluxo "Atualizar Bitrix24"** já existente: adicionar um passo `"Campos monetários"` no `handleResync` que chama `bitrix24-repair-money-fields`. Como é idempotente (`status: "already_money"` sai imediatamente), fica seguro rodar sempre que alguém clica em Atualizar — cobre novos portais e é auto-reparador se algum campo for recriado no futuro.

Nada muda na Edge Function em si — código atual serve os dois casos (execução manual agora + integração no resync).

## Arquivos alterados

- `src/pages/Integracoes.tsx` — remover botão/estado/handler, adicionar passo no `handleResync`.
