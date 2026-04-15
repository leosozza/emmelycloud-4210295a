
## Diagnóstico

Já não parece ser um problema de gravação. A permissão existe na base:

- portal `crm.emmelyfernandesadv.pt`
- integração `member_id = bea4c89b89c5c33f21450b1a633e6fb1`
- 1 permissão `emmely_app` guardada
- utilizador permitido gravado: `bitrix_user_id = "1"`

O problema provável está no carregamento do app dentro do Bitrix:

1. `src/pages/Bitrix24App.tsx` depende de `member_id` vindo do iframe
2. se esse `member_id` vier vazio, a função `bitrix24-connector-settings` entra no auto-resolve
3. nesse ramo, hoje ela devolve só `integration`, sem `appPermissions`
4. o frontend interpreta isso como “sem restrição” e mostra o app completo

Há ainda um segundo ponto a validar: o único utilizador permitido guardado é o ID `1`. Vou confirmar se esse ID é o Leonardo, porque se for, esse utilizador está efetivamente autorizado.

## Plano de correção

### 1. Corrigir a resolução da integração no backend
Em `supabase/functions/bitrix24-connector-settings/index.ts`:

- aceitar `domain` além de `member_id`
- resolver a integração por:
  1. `member_id`
  2. `domain`
  3. fallback final para a mais recente
- devolver `appPermissions` em todos os ramos, inclusive no auto-resolve
- devolver também um campo explícito como `appRestrictionEnabled`

### 2. Fechar o app por defeito quando a permissão não puder ser confirmada
Em `src/pages/Bitrix24App.tsx`:

- enviar `member_id` e `domain` para `bitrix24-connector-settings`
- trocar a lógica atual de “falha abre tudo” para “falha mostra só Chat IA”
- só renderizar navegação completa quando houver confirmação positiva de acesso
- manter `/bitrix24/chatia` como único destino permitido quando o utilizador não estiver autorizado

### 3. Tornar a restrição independente do número de utilizadores marcados
Hoje a restrição é inferida por `appPermissions.length > 0`, o que é frágil.

Vou ajustar `src/components/configuracoes/PermissoesTab.tsx` para guardar um flag real no `config` da integração, por exemplo:

- `restrict_app_access: true`

Assim:
- toggle “Restringir” fica persistido
- lista de utilizadores permitidos fica separada da ativação da regra
- o app não depende apenas da existência de linhas na tabela para saber se está restrito

### 4. Validar se o ID permitido pertence mesmo ao utilizador testado
Antes de concluir a correção, vou confirmar qual utilizador Bitrix corresponde ao ID `1`.

Se o Leonardo for o ID `1`, então:
- ele está mesmo autorizado hoje
- o bug principal continua a existir para os restantes utilizadores
- mas também precisaremos rever a seleção feita na tab de permissões para evitar confusão

## Ficheiros a alterar

- `supabase/functions/bitrix24-connector-settings/index.ts`
- `src/pages/Bitrix24App.tsx`
- `src/components/configuracoes/PermissoesTab.tsx`

## Resultado esperado

- utilizador sem permissão abre o app no Bitrix e vê apenas `Chat IA`
- sidebar reduzida para apenas essa opção
- utilizador autorizado continua com acesso completo a `/bitrix24/*`
- placements CRM continuam sem bloqueio
- mesmo que `member_id` não venha corretamente no iframe, o sistema deixa de liberar o app completo por engano
