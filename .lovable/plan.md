

## Plano: Adicionar aba "Carteira" ao Bitrix24App com clientes importados e vínculo aos Deals

### Problema
Após a importação de clientes (Fase 1), não existe feedback visual dos clientes importados dentro do Bitrix24App. O utilizador quer ver os clientes importados, os seus contratos/financial records e o vínculo com os Deals do Bitrix24.

### Solução
Adicionar uma nova view "Carteira" no Bitrix24App que consulta a tabela `clients` (filtrando por `notes LIKE '%Access%'`) e mostra os clientes importados com os seus dados financeiros e links para Deals no Bitrix24.

### Alterações em `src/pages/Bitrix24App.tsx`

**1. Adicionar "carteira" ao AppView type e à navegação:**
- Novo tipo: `"carteira"` no `AppView`
- Nova entrada na secção "Emmely Pay": `{ id: "carteira", label: "Carteira", icon: Users }`
- Render: `{view === "carteira" && <CarteiraAccessView integration={integration} memberId={memberId} />}`

**2. Nova view `CarteiraAccessView`:**
- Busca clientes da tabela `clients` com `notes.ilike.%Access%` (clientes importados)
- Para cada cliente, busca `financial_records` via contratos (`contracts` com `client_id`)
- Busca `payment_transactions` para ver links ao Bitrix24 (metadata contém deal_id)
- Mostra tabela com:
  - Nome, Documento, Nacionalidade, Contrato Activo
  - Nº de parcelas / valor total / valor pago
  - Badge com Deal ID do Bitrix24 (link clicável para abrir no CRM)
- Inclui pesquisa e contagem de clientes
- Expandir linha para ver detalhe das parcelas (financial_records) com status e datas

**3. Verificar tabelas existentes:**
- `clients` — já tem `notes` com "Importado do Access (ID: X)"
- `financial_records` — ligado via `contract_id`
- `payment_transactions` — tem `metadata` com possíveis refs ao Bitrix24

### Estrutura visual

```text
┌─────────────────────────────────────────────────────────┐
│ Carteira de Clientes Importados    [🔍 Pesquisar]       │
│ 45 clientes importados do Access                        │
├────────┬──────────┬────────┬────────┬─────────┬────────┤
│ Nome   │Documento │Parcelas│V.Total │ Pago    │Bitrix  │
│ Maria  │ 12345... │  6     │ €3.000 │ €2.000  │ D-142  │
│  └─ [expandir: lista de parcelas com status]            │
│ João   │ 67890... │  3     │ €1.500 │ €1.500  │ D-89   │
└────────┴──────────┴────────┴────────┴─────────┴────────┘
```

### Ficheiro a modificar

| Ficheiro | Acção |
|---|---|
| `src/pages/Bitrix24App.tsx` | Adicionar `carteira` ao type, nav e render; criar `CarteiraAccessView` |

