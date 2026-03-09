

## Plano: Página de Baixa de Pagamentos da Carteira (Bitrix24)

### Objetivo
Criar uma nova view "Baixa" no iframe Bitrix24 que permite:
1. Buscar deals do Bitrix24 com filtros (etapa, data)
2. Para cada deal, inserir parcelas pagas e pendentes manualmente
3. Dar baixa nos pagamentos (criar transações `confirmed` e `pending`)

---

### Implementação

#### 1. Adicionar View "Baixa" ao Menu

Em `Bitrix24App.tsx`, adicionar ao array de navegação:
```typescript
// Na categoria "Emmely Pay"
{ id: "baixa", label: "Baixa Carteira", icon: FileDown }
```

Atualizar o tipo `AppView` para incluir `"baixa"`.

#### 2. Criar `BaixaCarteiraView` Component

**Estrutura da UI:**

```text
┌────────────────────────────────────────────────────────────┐
│  FILTROS                                                   │
│  [Etapa: dropdown] [Data Início] [Data Fim] [Buscar]       │
├────────────────────────────────────────────────────────────┤
│  LISTA DE DEALS DO BITRIX24                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Deal: Contrato Maria Silva (ID: 8857)                │  │
│  │ Valor: €1.200 | Etapa: Contrato                      │  │
│  │ [Expandir para dar baixa ▼]                          │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ FORMULÁRIO DE BAIXA (expandido)                      │  │
│  │ Parcelas Totais: [6]  Valor Parcela: [200]          │  │
│  │ Parcelas Pagas: [3]   Gateway Futuro: [Direto ▼]    │  │
│  │                                                      │  │
│  │ Datas dos Pagamentos:                                │  │
│  │ [1] 2024-09-01  [2] 2024-10-01  [3] 2024-11-01      │  │
│  │                                                      │  │
│  │ Próximo Vencimento: [2025-01-01]                     │  │
│  │ [✓ Importar e Dar Baixa]                             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**

1. **Buscar Deals**:
   - Chamar Bitrix24 API via edge function (`crm.deal.list`) com filtros
   - Parâmetros: `STAGE_ID`, `>DATE_CREATE`, `<DATE_CREATE`

2. **Formulário de Baixa por Deal**:
   - Campos editáveis: parcelas totais, valor, pagas, datas, gateway
   - Buscar dados do contacto associado (nome, telefone, email)

3. **Processar Baixa**:
   - Criar transações `confirmed` para parcelas pagas
   - Criar transações `pending` para parcelas futuras
   - Vincular ao cliente (criar se não existir)

#### 3. Nova Edge Function: `bitrix24-fetch-deals`

```typescript
// GET ?member_id=xxx&stage_id=C5:1&date_from=2024-01-01&date_to=2025-01-01
// Retorna lista de deals com contacto associado
```

Fluxo:
1. Chamar `crm.deal.list` com filtros
2. Para cada deal, buscar `crm.contact.get` se tiver `CONTACT_ID`
3. Retornar array com: `{ id, title, opportunity, stage_name, contact_name, contact_phone, contact_email }`

#### 4. Lógica de Importação (no frontend)

Ao clicar "Importar e Dar Baixa":
1. Buscar/criar cliente na tabela `clients` por telefone/email
2. Inserir parcelas pagas via `payment_transactions`:
   ```json
   { "status": "confirmed", "gateway": "direto", "payment_method": "historico" }
   ```
3. Inserir parcelas pendentes:
   ```json
   { "status": "pending", "gateway": "direto", "metadata": { "due_date": "2025-01-01" } }
   ```

---

### Ficheiros a Criar/Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/pages/Bitrix24App.tsx` | Adicionar view `baixa` + componente `BaixaCarteiraView` |
| `supabase/functions/bitrix24-fetch-deals/index.ts` | **Nova** — buscar deals com filtros |

---

### Detalhes Técnicos

**Chamada Bitrix24 para buscar deals:**
```javascript
crm.deal.list({
  filter: {
    "STAGE_ID": stageId,
    ">DATE_CREATE": dateFrom,
    "<DATE_CREATE": dateTo
  },
  select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "CONTACT_ID", "STAGE_ID"]
})
```

**Estrutura da transação importada:**
```json
{
  "amount": 200,
  "currency": "EUR",
  "status": "confirmed",
  "gateway": "direto",
  "payment_method": "historico",
  "metadata": {
    "bitrix_deal_id": "8857",
    "installment_number": 1,
    "total_installments": 6,
    "imported": true,
    "original_paid_date": "2024-09-01"
  }
}
```

