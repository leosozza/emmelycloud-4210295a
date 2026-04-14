
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
- Reexecutar o fluxo de sincronização do Bitrix com as funções corrigidas.
- Confirmar que a integração termina com:
  - `connector_registered = true`
  - `connector_active = true`
  - pelo menos um `bitrix24_channel_mappings.is_active = true`
- Validar depois:
  - o conector aparece corretamente no Bitrix;
  - mensagem recebida entra no canal;
  - resposta enviada no Bitrix volta ao WhatsApp.

Detalhes técnicos

- Arquivos principais:
  - `supabase/functions/bitrix24-install/index.ts`
  - `supabase/functions/bitrix24-connector-settings/index.ts`
  - `supabase/functions/bitrix24-test-connection/index.ts`
  - `src/pages/Bitrix24App.tsx`
  - `src/pages/Integracoes.tsx`
- Não vejo necessidade de migration; o problema é de lógica e reconciliação de estado.
- Evidência atual:
  - integração `c6e5d046-38f1-44e2-937c-9988bf8c5b73` está com `connector_active=true` e `connector_registered=false`;
  - há canais ativos nas linhas 17 e 19;
  - os logs mostram `connector_activated` com sucesso, mas o estado de registo ficou preso num install antigo.

Resultado esperado

- O conector deixa de ficar “meio configurado”.
- O banco passa a refletir o estado real do Bitrix.
- A tela deixa de acusar “não registado” quando o conector já está ativo.
- O fluxo Bitrix ↔ canal aberto ↔ WhatsApp fica estável mesmo após re-sync ou token expirado.
