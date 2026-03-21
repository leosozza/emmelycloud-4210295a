

# Permissões de Acesso por Utilizador Bitrix24 — Emmely AI & Emmely Pay

## Conceito

O admin do Emmely Cloud escolhe quais utilizadores do Bitrix24 têm acesso a cada módulo (Emmely AI, Emmely Pay). Quando um utilizador sem permissão abre o placement, vê uma mensagem de "Sem acesso".

## Implementação

### 1. Migração — Tabela `bitrix24_user_permissions`

Nova tabela para armazenar as permissões por utilizador e módulo:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid PK | — |
| integration_id | uuid FK | Referência à integração |
| bitrix_user_id | text | ID do utilizador no Bitrix24 |
| module | text | `emmely_ai` ou `emmely_pay` |
| granted_at | timestamptz | Data de concessão |
| granted_by | uuid | Quem concedeu (user_id do Supabase) |

RLS: admin e service_role têm acesso total, service_role para as edge functions lerem.

### 2. Edge Functions — Verificação de acesso

**`bitrix24-crm-tab/index.ts`** e **`bitrix24-payment-tab/index.ts`**:

- Extrair o `AUTH_ID` do body (já existe) e chamar `user.current` via API Bitrix24 para obter o ID do utilizador
- Consultar `bitrix24_user_permissions` para verificar se o utilizador tem acesso ao módulo correspondente (`emmely_ai` para crm-tab, `emmely_pay` para payment-tab)
- Se não houver NENHUM registo na tabela para aquele módulo+integração → acesso livre (backwards compatible)
- Se houver registos mas o utilizador não estiver na lista → renderizar HTML de "Sem permissão"

### 3. UI de Gestão — Nova aba "Permissões" em Configurações

**`src/pages/Configuracoes.tsx`**:

Nova tab "Permissões Bitrix24":
- Usa o hook `useBitrixUsers()` (já existe) para listar todos os utilizadores ativos
- Duas secções: **Emmely AI** e **Emmely Pay**
- Cada secção mostra checkboxes com os utilizadores
- Toggle "Restringir acesso" por módulo — quando desativado, todos têm acesso
- Botão "Guardar" persiste na tabela `bitrix24_user_permissions`

### Ficheiros a criar/editar

1. **Migração SQL** — criar tabela `bitrix24_user_permissions`
2. **`supabase/functions/bitrix24-crm-tab/index.ts`** — verificar permissão do utilizador para `emmely_ai`
3. **`supabase/functions/bitrix24-payment-tab/index.ts`** — verificar permissão do utilizador para `emmely_pay`
4. **`src/pages/Configuracoes.tsx`** — nova aba de gestão de permissões com lista de utilizadores Bitrix24

