

## Diagnóstico

Três problemas confirmados:

1. **Edge function não foi deployed** — A resposta de `bitrix24-connector-settings` não inclui `appPermissions` nem `appRestrictionEnabled`. O código com essas alterações existe no repositório mas nunca foi publicado. Resultado: o frontend recebe `undefined` para ambos os campos e abre tudo.

2. **Permissão gravada para o utilizador errado** — A única permissão `emmely_app` está vinculada ao ID `1` (Ailson França, CEO). Leonardo de Souza é o ID `9909`. Quando Leonardo testou, não estava na lista de permitidos, mas como o backend não devolvia o campo `appRestrictionEnabled`, a restrição nunca foi aplicada.

3. **Loading infinito** — O `BX24.callMethod("user.current")` tem um timeout de 5s, mas o app ficava preso porque a edge function retornava dados incompletos, causando estado inconsistente.

## Plano de correção

### 1. Deploy da edge function `bitrix24-connector-settings`
A versão no código já está correcta (inclui `getAppAccessData`, devolve `appPermissions` e `appRestrictionEnabled`). Basta fazer o deploy.

### 2. Corrigir a permissão na base de dados
Actualizar o `bitrix_user_id` de `"1"` para `"9909"` (Leonardo) na tabela `bitrix24_user_permissions`, ou verificar com o utilizador quais IDs devem ter acesso.

### 3. Adicionar logs de diagnóstico no frontend
Manter o `console.log` existente no `Bitrix24App.tsx` que mostra o userId, as permissões e o estado da restrição para facilitar debug futuro.

### 4. Melhorar a tab de Permissões
O `PermissoesTab.tsx` já utiliza `useBitrixUsers` para mostrar os utilizadores com checkbox. O problema é que a selecção não reflectia o utilizador correcto. Nenhuma alteração de código necessária — a UI já está funcional, o problema era o ID errado gravado.

## Ficheiros a alterar
- **Deploy**: `supabase/functions/bitrix24-connector-settings/index.ts` (já correcto, falta deploy)
- **Dados**: Actualizar `bitrix24_user_permissions` — trocar bitrix_user_id `"1"` pelo(s) ID(s) correcto(s)

## Resultado esperado
- Backend devolve `appRestrictionEnabled: true` e `appPermissions: ["9909"]`
- Leonardo (ID 9909) acede ao app completo
- Outros utilizadores vêem apenas Chat IA
- Loading resolve em menos de 5 segundos

