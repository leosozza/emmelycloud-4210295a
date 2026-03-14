

## Plano: Importação em 2 fases (Clientes → Honorários)

### Conceito

Separar a importação em dois passos independentes na UI e no backend:

1. **Fase 1 — Importar Clientes**: Carrega apenas `TBL_CLIENTE.xlsx`, cria/actualiza clientes na base de dados e cria Contactos + Deals vazios no Bitrix24 (1 Deal por cliente, sem parcelas ainda)
2. **Fase 2 — Importar Honorários**: Carrega `TBL_HONORARIOS.xlsx`, associa cada grupo (SEPARADORID) ao cliente existente, cria a cadeia lead→case→proposal→contract→financial_records e actualiza o Deal no Bitrix com valores, status e Smart Invoices

### Alterações

#### 1. Edge Function `import-access-data/index.ts`
Adicionar um parâmetro `mode`:
- **`mode: "clients_only"`** — recebe apenas `clientes[]`, faz upsert na tabela `clients` e cria Contacto + Deal vazio no Bitrix (com `STAGE_ID: "NEW"`, `OPPORTUNITY: 0`). Retorna o mapeamento `{accessId → clientId}`.
- **`mode: "honorarios"` (ou sem mode, compatível)** — comportamento actual: recebe `clientes[]` + `honorarios[]`, cria a cadeia completa e actualiza Deals no Bitrix com valores reais, parcelas e badges.

No modo `clients_only`, o Deal no Bitrix é criado com título `"CLIENTE - {NOME}"` e campo `UF_CRM_1768312831 = clientAccessId`, para que a fase 2 consiga encontrá-lo e actualizá-lo.

#### 2. UI em `src/pages/Bitrix24App.tsx` — `ImportacaoAccessView`
Transformar a interface num wizard de 2 passos:
- **Passo 1**: Upload de `TBL_CLIENTE.xlsx` + botão "Importar Clientes". Mostra contagem e progresso. Filtros de data/status não se aplicam aqui.
- **Passo 2**: Upload de `TBL_HONORARIOS.xlsx` + filtros de data/status existentes + botão "Importar Honorários". Disponível só após o passo 1 concluir (ou se já existem clientes na base).
- Cada passo tem o seu próprio progresso e logs.

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/import-access-data/index.ts` | Adicionar `mode` param; extrair lógica de "clients_only" que faz upsert + Bitrix Contact/Deal vazio |
| `src/pages/Bitrix24App.tsx` | Refactor `ImportacaoAccessView` para wizard 2 passos com estados e botões independentes |

### Fluxo resumido

```text
Passo 1: TBL_CLIENTE.xlsx
  → Edge Function (mode=clients_only)
  → Upsert clients table
  → Bitrix: Contact + Deal vazio por cliente
  → UI: "✅ 400 clientes importados"

Passo 2: TBL_HONORARIOS.xlsx (com filtros)
  → Edge Function (mode=honorarios)
  → Busca client_id por document_number
  → Cria lead→case→proposal→contract→financial_records
  → Bitrix: Actualiza Deal com valores + Smart Invoices + badges
  → UI: "✅ 343 serviços importados"
```

