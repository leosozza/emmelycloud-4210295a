

## Plano: Fase 3 interactiva — lista por status + aprovação individual ou lote

### Resumo

Substituir o botão batch actual da Fase 3 por uma interface interactiva com:
1. Botão "Carregar Clientes" que busca clientes do Supabase + faz lookup no Bitrix
2. Três tabs: **Quitados** | **Em Aberto** | **Atrasados** (com contadores)
3. Cada cliente mostra: nome, NIF, telefone, totais, match Bitrix (se encontrou)
4. Dois modos de operação: **aprovar um a um** (com dialog para editar e escolher acções) ou **importar em lote** (checkbox + botão batch)

### Alterações

**1. Edge Function `import-access-data/index.ts`** — 2 novos modes

- **`list_sync_clients`**: Busca clientes importados do Supabase, classifica em `quitado`/`aberto`/`atrasado`, faz lookup no Bitrix (UF/NIF/telefone), retorna lista com: `client_id`, `name`, `nif`, `phones`, `emails`, `total_value`, `total_paid`, `status_class`, `bitrix_contact_id`, `bitrix_deal_id`, `services[]`, `records_count`. Paginado.

- **`sync_single_client`**: Recebe `client_id`, `member_id`, `category_id`, `actions: {contact, deal, invoices}`, `overrides: {name, phone, nif}`. Executa apenas as acções seleccionadas. Reutiliza a lógica existente do `sync_bitrix` mas para um único cliente.

**2. Frontend `Bitrix24App.tsx`** — refactorizar Fase 3

- Estado: `syncClients[]` (lista carregada), `activeTab` (quitado/aberto/atrasado), `selectedIds` (Set para batch), `editingClient` (dialog aberto)
- "Carregar Clientes" chama `list_sync_clients` em batches, preenche a lista
- 3 tabs com Tabs component, cada tab filtra `syncClients` por `status_class`
- Cada linha: nome, NIF, telefone, valor, badge Bitrix match, checkbox (batch) + botão "Sincronizar" (individual)
- Dialog individual: campos editáveis (nome, telefone, NIF), match Bitrix mostrado, checkboxes Contacto/Deal/Faturas, botão confirmar → chama `sync_single_client`
- Toolbar batch: "Selecionar todos" + dropdown acções (Contacto+Deal+Faturas) + botão "Sincronizar X seleccionados" → loop `sync_single_client` para cada

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/import-access-data/index.ts` | Adicionar modes `list_sync_clients` e `sync_single_client`; manter `sync_bitrix` existente |
| `src/pages/Bitrix24App.tsx` | Refactorizar Fase 3: tabs por status, lista interactiva, dialog individual, toolbar batch |

