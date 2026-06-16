## Problema

Ao abrir o slider de configuração do conector Emmely no Contact Center (ou ao receber qualquer chamada `SETTING_CONNECTOR` sem `ACTIVE_STATUS`), o backend reativa a linha automaticamente — mesmo que o utilizador a tenha acabado de desativar.

## Causa

Em `supabase/functions/bitrix24-connector-settings/index.ts` há este default explícito:

```ts
const rawStatus = String(activeStatus ?? "").toUpperCase();
const shouldActivate = !(rawStatus === "N" || rawStatus === "0" || rawStatus === "FALSE");
// "Default to active when omitted because the legacy slider opens with the intent to enable."
```

Quando o Bitrix24 reabre o slider de uma linha já configurada (ex.: a linha "Facebook"), `PLACEMENT_OPTIONS.ACTIVE_STATUS` chega vazio. O código interpreta como "ativar" e chama `imconnector.activate ACTIVE=1`, revertendo a desativação anterior.

## Correção

Tornar a ação idempotente em relação ao estado real, em vez de assumir intent:

1. Quando `ACTIVE_STATUS` **não vier no payload**:
   - Procurar o mapping atual em `bitrix24_channel_mappings` para `(integration_id, line_id)`.
   - Se existir, usar `is_active` atual como `shouldActivate` (preserva o estado escolhido pelo utilizador).
   - Se não existir, **não** chamar `imconnector.activate` nem criar mapping — apenas devolver o HTML de `installFinish()` para o slider abrir.
2. Quando `ACTIVE_STATUS` vier (`Y`/`N`/`1`/`0`): manter o comportamento atual (respeitar a escolha explícita do utilizador).
3. Log adicional indicando se o estado foi "explicit" vs "preserved from DB" vs "no-op (no mapping)" em `bitrix24_debug_logs` para diagnóstico futuro.

Nenhuma outra função é tocada. O frontend não muda.

## Validação

- Desativar canal Facebook no Contact Center → mapping fica `is_active=false`.
- Reabrir o slider sem clicar em ativar → log mostra "preserved from DB: inactive", `imconnector.activate` **não** é chamado, linha continua desativada.
- Ativar explicitamente → `ACTIVE_STATUS=Y` chega, fluxo normal de ativação roda.
