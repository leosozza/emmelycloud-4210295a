

## Plano: Importação Access → Emmely + Bitrix24

### Análise do ficheiro

O `TABELA_CONSOLIDADA_ESTRUTURADA.json` está bem estruturado pelo Manus:
- **~1080 clientes** com dados pessoais (nome, NIF, documento, morada, nacionalidade)
- **~5780 honorários** com parcelas detalhadas (valor, vencimento, pagamento, status)
- Statuses: `QUITADO`, `PENDENTE`, `PARCIAL`
- Período: 2022 a 2026

### Mapeamento de dados

```text
Access (JSON)              →  Emmely (Supabase)         →  Bitrix24
─────────────────────────────────────────────────────────────────────
cliente.nome               →  clients.name               →  Contact NAME
cliente.nif                →  clients.document_number     →  Contact UF_NIF
cliente.documento          →  clients.document_type=doc   →  Contact UF_DOCUMENTO
cliente.nascimento         →  clients.birth_date          →  Contact BIRTHDATE
cliente.nacionalidade      →  clients.nationality         →  Contact UF_NACIONALIDADE
cliente.morada             →  clients.address             →  Contact ADDRESS
cliente.codigopostal       →  clients.postal_code         →  Contact ADDRESS_POSTAL_CODE
cliente.pais               →  clients.country             →  Contact ADDRESS_COUNTRY
cliente.email              →  (se existir)                →  Contact EMAIL

honorario                  →  financial_records            →  Deal (1 por serviço)
  descricao                →  description                  →  Deal TITLE
  valor                    →  total_value                  →  Deal OPPORTUNITY
  parcela N/M              →  installment_number/total     →  Smart Invoice (Type 31)
  valor_parcela            →  installment_value            →  Invoice opportunity
  status QUITADO           →  status=pago                  →  Invoice stage P (paid)
  status PENDENTE          →  status=pendente              →  Invoice stage NEW
```

### Implementação

**1. Edge Function `import-access-data/index.ts`** — processa o JSON em batches:

- Recebe o JSON via POST (ou lê de storage)
- Para cada cliente:
  - Upsert em `clients` (match por `document_number` / NIF)
  - Agrupa honorários por `descricao` (cada serviço distinto = 1 contract/financial group)
  - Cria `financial_records` para cada parcela
  - Se `member_id` fornecido: cria Contact + Deal + Smart Invoices no Bitrix24
- Processa em batches de 10 clientes para evitar timeouts
- Retorna progresso (`processed`, `total`, `errors`)

**2. Página de importação no frontend** (`src/pages/Bitrix24App.tsx` — nova view ou modal):

- Upload do JSON ou selecção do ficheiro já carregado
- Preview: tabela com total de clientes e honorários detectados
- Botão "Importar" que chama a edge function em batches
- Barra de progresso com contagem de clientes processados
- Log de erros para registos que falharam

**3. Lógica de deduplicação**:

- Match por `document_number` (NIF) para evitar duplicados na reimportação
- Para Bitrix24: busca contacto existente por NIF antes de criar novo

### Ficheiros a criar/modificar

| Ficheiro | Acção |
|----------|-------|
| `supabase/functions/import-access-data/index.ts` | Criar — edge function de importação batch |
| `src/pages/Bitrix24App.tsx` | Adicionar view de importação com upload + progresso |
| `supabase/config.toml` | Registar a nova function (verify_jwt=false) |

### Considerações

- O ficheiro tem 74K linhas (~3MB) — a edge function processará em batches para não ultrapassar o timeout de 60s
- Clientes sem NIF usarão o `id` do Access como fallback de identificação
- Honorários com `status=QUITADO` criarão `financial_records` com `status=pago` e `paid_at` preenchido

