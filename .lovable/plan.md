

## Plano: Ressincronizar dados importados para corrigir datas

### Situação actual

- **413 leads** importados, dos quais **343 têm data de hoje** (2026-03-14) porque foram importados antes da correcção do campo `DATA`
- **70 leads** já têm datas históricas correctas (importados após a correcção)
- A coluna `DATA` original do Access (data do contrato) **não foi guardada** em nenhum campo — não é possível recalcular a partir dos dados já na base

### Abordagem recomendada: Limpar e reimportar

Como a data original `DATA` não está persistida na base de dados (apenas `due_date` das parcelas existe, que é `DATA_VENC` e não `DATA`), a forma mais fiável é:

1. **Limpar os registos com data errada** — apagar a cadeia completa (financial_records → contracts → proposals → cases → leads) onde `created_at::date = '2026-03-14'` e `sync_source = 'access_import'`
2. **Manter os 70 leads com datas correctas** (já importados com a correcção)
3. **Reimportar apenas os clientes afectados** usando os ficheiros Excel — a Edge Function corrigida agora extrai `DATA` correctamente

### Passos de implementação

| Passo | Acção |
|-------|-------|
| 1 | Executar DELETE em cascata para leads com `sync_source = 'access_import'` AND `created_at::date = '2026-03-14'` |
| 2 | Manter clientes (`clients`) — serão actualizados via upsert na reimportação |
| 3 | Reimportar os ficheiros Excel pela interface — a EF já aplica `DATA` como `created_at` |

### SQL de limpeza

```sql
-- 1. financial_records
DELETE FROM financial_records WHERE contract_id IN (
  SELECT ct.id FROM contracts ct
  JOIN proposals p ON ct.proposal_id = p.id
  JOIN cases c ON p.case_id = c.id
  JOIN leads l ON c.lead_id = l.id
  WHERE l.sync_source = 'access_import' AND l.created_at::date = '2026-03-14'
);

-- 2. contracts
DELETE FROM contracts WHERE proposal_id IN (
  SELECT p.id FROM proposals p
  JOIN cases c ON p.case_id = c.id
  JOIN leads l ON c.lead_id = l.id
  WHERE l.sync_source = 'access_import' AND l.created_at::date = '2026-03-14'
);

-- 3. proposals
DELETE FROM proposals WHERE case_id IN (
  SELECT c.id FROM cases c
  JOIN leads l ON c.lead_id = l.id
  WHERE l.sync_source = 'access_import' AND l.created_at::date = '2026-03-14'
);

-- 4. cases
DELETE FROM cases WHERE lead_id IN (
  SELECT id FROM leads
  WHERE sync_source = 'access_import' AND created_at::date = '2026-03-14'
);

-- 5. leads
DELETE FROM leads
WHERE sync_source = 'access_import' AND created_at::date = '2026-03-14';
```

Após a limpeza, reimportar os ficheiros Excel pela interface. Os clientes existentes serão actualizados (upsert por `document_number`) e as novas cadeias lead→case→proposal→contract→financial_records terão as datas históricas correctas.

