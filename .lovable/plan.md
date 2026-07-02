# Corrigir "Reparar Campos" para não apagar dados do Bitrix

## Problema

Hoje o endpoint `bitrix24-install?action=repair_fields` (arquivo `supabase/functions/bitrix24-install/index.ts`, linhas ~385–686) faz:

1. Lista **todos** os campos `UF_CRM_EMMELY_*` em Deal e Lead.
2. **Apaga todos** via `crm.deal.userfield.delete` / `crm.lead.userfield.delete`.
3. Recria via `.userfield.add`.

Ao apagar o campo, o Bitrix **remove os valores gravados nos deals/leads**. Por isso, sempre que se clica em "Atualizar Bitrix24" (que chama repair_fields), perdem-se dados já preenchidos (status de pagamento, valor entrada, saldo, etc.). O mesmo padrão destrutivo existe no fluxo de reinstalação (linhas ~1685–1735).

## Solução: reparar de forma idempotente (upsert, nunca delete)

Substituir a lógica destrutiva por uma que preserva os campos existentes e apenas cria/atualiza o necessário.

### Novo comportamento de `repair_fields`

Para cada campo definido em `emmelyUserFields` (Deal e Lead):

1. **Listar** os campos existentes (`crm.deal.userfield.list` / `crm.lead.userfield.list`) e indexar por `FIELD_NAME`.
2. Para cada campo desejado:
   - **Não existe** → `crm.<entity>.userfield.add` (cria, sem tocar em nada).
   - **Existe** → `crm.<entity>.userfield.update` com `id` do campo, atualizando apenas:
     - labels (`EDIT_FORM_LABEL`, `LIST_COLUMN_LABEL`, `LIST_FILTER_LABEL`)
     - `SETTINGS`
     - para `enumeration`: fazer merge da `LIST` — manter os `ID` existentes intactos, adicionar apenas entradas novas por `VALUE` (Bitrix apaga valores gravados se o `ID` da opção mudar).
   - **Nunca** chamar `.userfield.delete`.
3. Campos "órfãos" `UF_CRM_EMMELY_*` que existam no Bitrix e não estejam mais em `emmelyUserFields`: **manter** (apenas logar no relatório como `orphan_kept`). Se algum dia for necessário limpar, criar uma ação separada explícita (`action=purge_orphan_fields`) que exige confirmação — fora do escopo do botão único.
4. Relatório passa a devolver `created_deal`, `updated_deal`, `unchanged_deal`, `orphan_kept_deal` (e equivalentes lead) em vez de `deleted_*`.

### Enumerations (crítico)

Para campos como `UF_CRM_EMMELY_PAYMENT_STATUS` e `UF_CRM_EMMELY_PAYMENT_METHOD`:

- Ler `LIST` atual do campo no Bitrix (cada item tem `ID`, `VALUE`, `SORT`, `DEF`).
- Construir novo `LIST` para o update:
  - Cada item existente entra com seu `ID` original preservado.
  - Itens desejados que não existem entram sem `ID` (Bitrix cria).
  - Não remover itens existentes (mesmo que não estejam na definição), para não invalidar deals que já tenham o valor selecionado.

### Fluxo de reinstalação (linhas ~1685–1735)

Aplicar a mesma lógica idempotente: remover o bloco que dá `.userfield.delete` em massa e substituir pelo mesmo helper de upsert. Assim, reinstalar a app também deixa de apagar dados.

### Helper compartilhado

Extrair para uma função `upsertEmmelyUserFields(ep, token, fieldsDef)` reutilizada tanto pelo `repair_fields` quanto pelo caminho de instalação, para garantir consistência.

## Arquivos afetados

- `supabase/functions/bitrix24-install/index.ts` — substituir bloco `repair_fields` (linhas ~408–686) e bloco de reinstalação (linhas ~1685–1735) pela nova lógica idempotente.

Nenhuma alteração no frontend — o botão "Atualizar Bitrix24" continua igual, mas passa a ser **seguro** de correr sempre que quiser.

## Validação

- Rodar `repair_fields` em ambiente com deals que tenham `UF_CRM_EMMELY_PAYMENT_STATUS` preenchido e confirmar que o valor permanece após a execução.
- Rodar duas vezes seguidas e confirmar que a 2ª execução reporta tudo como `unchanged` (sem creates/updates desnecessários).
- Adicionar/remover manualmente uma opção da enum no Bitrix e confirmar que o repair não apaga a opção manual e ainda garante que as opções oficiais existem.
