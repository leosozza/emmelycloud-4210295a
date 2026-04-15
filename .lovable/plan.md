

## Problema

A tab "Permissões" em `/configuracoes` controla actualmente módulos `emmely_ai` e `emmely_pay`, e essa verificação é feita nos **CRM tabs** (placements). Mas o pedido é diferente:

- **Permissões controlam o acesso ao APP** (`/bitrix24/*`), **não** aos placements CRM
- Quem **não tem permissão** → vê apenas `/bitrix24/chatia`
- Quem **tem permissão** → acesso completo a `/bitrix24/*`
- Os placements (CRM tabs) funcionam **sem restrição** para todos
- Futuramente: acesso granular por secção (Emmely IO, Emmely CRM, Emmely Pay, Sistema)

## Plano

### 1. Adicionar módulo `emmely_app` à tabela de permissões

Criar um novo módulo `emmely_app` na tabela `bitrix24_user_permissions`. Quando a restrição está activa e o utilizador **não** está na lista, ele só vê o Chat IA.

**Migração SQL:**
```sql
-- A coluna module já é text livre, não precisa de ALTER
-- Apenas garantir que o valor 'emmely_app' é aceite (já é)
```

Não é necessária migração — o campo `module` já é `text`.

### 2. Actualizar `PermissoesTab.tsx`

- Substituir as secções `emmely_ai` e `emmely_pay` por uma única secção `emmely_app` com label **"Acesso ao Aplicativo"** e descrição **"Quando activo, apenas os utilizadores seleccionados acedem ao aplicativo completo. Os restantes terão acesso apenas ao Chat IA. Os placements CRM não são afectados."**
- Manter a mesma UX (Switch + lista de checkboxes de utilizadores Bitrix24)

### 3. Verificar permissão no `Bitrix24App.tsx` (frontend)

Após `fetchData` obter a `integration`, chamar `BX24.callMethod("user.current")` para obter o `bitrixUserId`, depois consultar `bitrix24_user_permissions` com `module = 'emmely_app'`:

- Se **não existem** registos com `emmely_app` → todos têm acesso (sem restrição)
- Se **existem** registos mas o utilizador **não está** na lista → forçar `view = "chatia"` e esconder o sidebar (ou mostrar só o item Chat IA)
- Se o utilizador **está** na lista → acesso completo

Guardar o resultado num state `appRestricted: boolean` e `hasAppAccess: boolean`.

### 4. Filtrar sidebar e navegação

No `navCategories`, quando `appRestricted && !hasAppAccess`:
- Mostrar apenas `{ id: "chatia", label: "Chat IA", icon: Sparkles }`
- Redirigir automaticamente para `/bitrix24/chatia` se tentar aceder a outra rota

### 5. Remover verificação de permissão dos CRM tabs

Nas Edge Functions `bitrix24-crm-tab`, `bitrix24-payment-tab` e `bitrix24-booking-tab`:
- Remover o bloco de verificação `emmely_ai` / `emmely_pay` que retorna "Sem Permissão"
- Os placements passam a ser acessíveis a todos os utilizadores

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `src/components/configuracoes/PermissoesTab.tsx` | Substituir `emmely_ai`/`emmely_pay` por `emmely_app` |
| `src/pages/Bitrix24App.tsx` | Adicionar check de permissão após init, filtrar sidebar |
| `supabase/functions/bitrix24-crm-tab/index.ts` | Remover bloco de permissão ~linhas 977-1007 |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Remover bloco de permissão |
| `supabase/functions/bitrix24-booking-tab/index.ts` | Remover bloco de permissão |

### Resultado esperado
- Toggle "Restringir Acesso ao Aplicativo" em `/configuracoes` → Permissões
- Utilizadores restritos → abrem o app e vêem apenas o Chat IA
- Placements CRM (Emmely Consulta, Emmely Pay, Booking) → funcionam para todos sem restrição
- Base preparada para futuramente adicionar permissões granulares por secção

