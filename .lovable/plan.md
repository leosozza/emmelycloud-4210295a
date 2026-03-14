

## Plano: Persistir ficheiros XLSX no Storage antes de importar

### Problema
Os ficheiros XLSX são lidos apenas em memória (via `FileReader` → `parseXlsx`). Se a página recarrega ou a internet oscila, perde-se o ficheiro e todo o progresso.

### Solução
1. Criar bucket `import-files` no Storage
2. Ao fazer upload do XLSX, guardar o ficheiro no bucket antes de o processar
3. Criar tabela `import_sessions` para rastrear sessões activas (fase, progresso, path do ficheiro)
4. Ao reabrir a página, verificar sessões activas e recarregar o ficheiro do Storage para retomar

### Alterações

**1. Migration SQL**
- Criar bucket `import-files` (privado)
- Criar tabela `import_sessions`:
  - `id`, `phase` (clients/honorarios), `status` (in_progress/done/error)
  - `file_path` (caminho no bucket), `total_items`, `processed_items`
  - `logs` (jsonb), `filter_config` (jsonb — filtros fase 2)
  - `created_at`, `updated_at`
- RLS: authenticated can ALL, service_role can ALL

**2. Frontend `Bitrix24App.tsx` — `ImportacaoAccessView`**

Fluxo de upload alterado:
```text
Seleccionar XLSX → Upload para storage (import-files/clients_{timestamp}.xlsx)
                 → Criar import_session com file_path
                 → Parse local para mostrar dados na UI
```

Fluxo de importação com checkpoint:
```text
Cada batch completo → UPDATE import_sessions SET processed_items = X, logs = [...]
```

Fluxo de resume (on mount):
```text
SELECT * FROM import_sessions WHERE status = 'in_progress'
  → Se encontrar: download ficheiro do storage → parse → restaurar estado
  → Retomar a partir de processed_items
```

Mudanças específicas:
- `handleClientesUpload` e `handleHonorariosUpload`: após `parseXlsx`, fazer `supabase.storage.from('import-files').upload(path, file)` e criar sessão na tabela
- `handleImportClients` e `handleImportHonorarios`: após cada batch, `UPDATE import_sessions SET processed_items, logs`
- Novo `useEffect` no mount: query `import_sessions` com `status = 'in_progress'`, se existir, download o ficheiro do Storage, parse, restaurar contadores e logs, marcar fase como "em curso"
- Ao concluir fase: `UPDATE import_sessions SET status = 'done'`
- Botão "Limpar Sessão" para apagar ficheiro do storage e sessão da tabela

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| Migration SQL | Criar bucket `import-files` + tabela `import_sessions` com RLS |
| `src/pages/Bitrix24App.tsx` | Upload para storage, criar/atualizar sessão, restaurar no mount |

