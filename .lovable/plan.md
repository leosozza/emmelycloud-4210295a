

## Plano: Adicionar colunas `id_access` e `bitrix24_id` à tabela `clients`

### Problema
O ID do Access está guardado dentro do campo `notes` como texto livre (`Importado do Access (ID: 123)`), obrigando a extrações por regex em todo o código. Não existe coluna para o ID do contacto Bitrix24, impedindo rastreabilidade directa.

### Alterações

**1. Migração — adicionar 2 colunas à tabela `clients`**
```sql
ALTER TABLE public.clients ADD COLUMN id_access text;
ALTER TABLE public.clients ADD COLUMN bitrix24_id text;
CREATE INDEX idx_clients_id_access ON public.clients(id_access) WHERE id_access IS NOT NULL;
CREATE INDEX idx_clients_bitrix24_id ON public.clients(bitrix24_id) WHERE bitrix24_id IS NOT NULL;
```

**2. Migração de dados — preencher `id_access` a partir do `notes` existente**
```sql
UPDATE public.clients
SET id_access = (regexp_match(notes, 'ID:\s*(\d+)'))[1]
WHERE notes LIKE '%Importado do Access%' AND id_access IS NULL;
```

**3. Backend `import-access-data/index.ts`**
- Na inserção/update de clientes (Fase 1), incluir `id_access: client.ID` no payload em vez de só no `notes`.
- Na Fase 3 (`list_sync_clients` e `sync_single`), usar `id_access` directamente em vez de `regex match` no `notes`.
- Ao criar contacto no Bitrix24 com sucesso, guardar o `bitrix24_id` retornado no registo do cliente via `supabase.from("clients").update({ bitrix24_id })`.

**4. Backend `bitrix24-fetch-portfolio/index.ts`**
- Substituir `.ilike("notes", "%Access%")` por `.not("id_access", "is", null)` — mais eficiente e preciso.
- Usar `c.id_access` directamente em vez de regex no `notes`.

**5. Frontend `Bitrix24App.tsx`**
- Nas interfaces `SyncClient` e similares, usar `access_id` vindo do backend (já existe, mas agora baseado na coluna real).
- Na página de Clientes (`Clientes.tsx`), mostrar as colunas `ID Access` e `ID Bitrix` na tabela e no formulário.

### Ficheiros alterados
- Migração SQL (2 colunas + backfill)
- `supabase/functions/import-access-data/index.ts`
- `supabase/functions/bitrix24-fetch-portfolio/index.ts`
- `src/pages/Clientes.tsx`

