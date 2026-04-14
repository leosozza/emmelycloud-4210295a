
Objetivo

Corrigir o fluxo de registo do conector Bitrix para que o estado real no backend e no Bitrix fique consistente e o canal volte a funcionar de forma previsível.

O que encontrei

- A integração atual está inconsistente: `connector_active = true` e `connector_registered = false`.
- Existem mapeamentos ativos para as linhas 17 e 19, e há logs recentes de `connector_activated` com sucesso.
- O `bitrix24-install` gravou `connector_registered = false` num install antigo e esse estado nunca foi reconciliado depois.
- O `bitrix24-install` também força `connector_active = false` no re-sync, o que pode “desativar” o estado salvo mesmo quando o canal já estava ativo.
- O `bitrix24-connector-settings` usa `imconnector.connector.data.set` com payload fora do formato oficial (`id/name/placement_handler`), enquanto a API espera `ID/NAME/URL[/URL_IM]`.
- A UI e o `bitrix24-test-connection` mostram os flags do banco como verdade absoluta, então continuam a exibir “não registado” mesmo após ativação real.

Plano de implementação

1. Corrigir o registo no install
- Refatorar `supabase/functions/bitrix24-install/index.ts` para:
  - usar um helper único com refresh/retry em `expired_token`;
  - padronizar as chamadas ao Bitrix no fluxo de install;
  - guardar erro bruto do `imconnector.register` no `config` para diagnóstico;
  - marcar `connector_registered = true` quando houver sucesso ou `CONNECTOR_ALREADY_EXISTS`;
  - preservar o estado real do `connector_active` em vez de o forçar para `false` no re-sync.

2. Corrigir a configuração do conector no canal
- Ajustar `supabase/functions/bitrix24-connector-settings/index.ts` para enviar `DATA` no formato oficial do Bitrix:
  - `ID`
  - `NAME`
  - `URL`
  - `URL_IM` (ou fallback para `URL`)
- Remover `placement_handler` de `imconnector.connector.data.set`, porque isso pertence ao `imconnector.register`, não ao `connector.data.set`.
- Só marcar sucesso se `imconnector.activate` e `imconnector.connector.data.set` retornarem OK.
- Quando isso acontecer, atualizar também `connector_registered = true`, não apenas `connector_active = true`.

3. Separar estado bruto de estado efetivo
- Atualizar `supabase/functions/bitrix24-test-connection/index.ts` para retornar:
  - estado do token/app;
  - flags brutas do banco;
  - estado efetivo calculado (ex.: há linhas mapeadas, houve ativação recente, último erro conhecido).
- Isso evita falsos negativos quando o banco estiver atrasado em relação ao estado real do Bitrix.

4. Melhorar a leitura do status na interface
- Ajustar `src/pages/Bitrix24App.tsx` e `src/pages/Integracoes.tsx` para mostrar separadamente:
  - App conectado
  - Conector registado
  - Conector ativado em canal
  - Linhas ativas mapeadas
  - Último erro de registo/configuração
- O botão de re-sincronização passará a usar a lógica corrigida sem “quebrar” o estado já ativo.

5. Validar ponta a ponta
- Reexecutar o