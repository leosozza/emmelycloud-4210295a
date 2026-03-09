

## Plano: Edição de Pagamentos no Placement com Sincronização para Bitrix24

### Objetivo
Aprimorar a view "Baixa Carteira" no iframe Bitrix24 para permitir edição completa de pagamentos com indicadores de campos faltantes e sincronização bidirecional.

---

### Funcionalidades a Implementar

#### 1. Indicadores de Campos Faltantes
- Badge visual em cada deal mostrando campos incompletos (ex: "3 campos faltantes")
- Ícone de alerta ao lado de campos não preenchidos
- Cor diferenciada para deals com dados incompletos vs. completos

#### 2. Campos Adicionais no Formulário
Além dos existentes, adicionar:
- **Método de pagamento** (Transferência, Cartão, MB Way, PIX, Boleto)
- **Status atual** (Pago, Pendente, Vencido)
- **Notas/Observações** para cada cliente

#### 3. Sincronização para Bitrix24
Após preencher no placement:
- Atualizar campos customizados no Deal (UF_CRM_* fields)
- Criar/atualizar Smart Invoice para cada parcela
- Registar data de recebimento confirmada

---

### Implementação

#### Edge Function: `bitrix24-update-deal-payment`
Nova função para sincronizar dados de pagamento de volta ao Bitrix24:

```typescript
// POST body:
{
  "member_id": "xxx",
  "deal_id": "8857",
  "payment_data": {
    "total_installments": 6,
    "installment_value": 200,
    "paid_installments": 3,
    "paid_dates": ["2024-09-01", "2024-10-01", "2024-11-01"],
    "next_due_date": "2025-01-01",
    "payment_method": "transferencia",
    "gateway": "direto"
  }
}

// Ações:
1. crm.deal.update → atualizar campos UF_*
2. Para cada parcela → criar/atualizar Smart Invoice
```

#### UI: Indicadores Visuais

```text
┌─────────────────────────────────────────────────────────┐
│ Deal: Contrato Maria Silva                              │
│ Valor: €1.200 | Etapa: Contrato                         │
│                                                         │
│ ⚠ 3 campos faltantes   [Expandir ▼]                    │
├─────────────────────────────────────────────────────────┤
│ FORMULÁRIO (expandido)                                  │
│                                                         │
│ ⚠ Parcelas Totais: [___]   ✓ Valor: [200]              │
│ ⚠ Parcelas Pagas: [___]    ⚠ Método: [Selecionar ▼]   │
│                                                         │
│ Datas dos Pagamentos: (campos com fundo amarelo = vazio)│
│ [1] ⚠ ________   [2] ⚠ ________   [3] ⚠ ________       │
│                                                         │
│ ✓ Próximo Vencimento: [2025-01-01]                     │
│                                                         │
│ [Salvar no Bitrix24] [Importar e Dar Baixa]            │
└─────────────────────────────────────────────────────────┘
```

---

### Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `src/pages/Bitrix24App.tsx` | Aprimorar `BaixaCarteiraView` com indicadores e novo botão de sync |
| `supabase/functions/bitrix24-update-deal-payment/index.ts` | **Nova** — sincronizar pagamentos para Bitrix24 |

---

### Fluxo de Uso

1. Buscar deals do Bitrix24 com filtros
2. Ver indicador de campos faltantes em cada deal
3. Expandir deal → preencher campos vazios (destacados em amarelo)
4. **"Salvar no Bitrix24"** → atualiza campos UF_* e cria Smart Invoices
5. **"Importar e Dar Baixa"** → cria transações no Supabase (como já existe)

---

### Campos UF_* Sugeridos no Bitrix24
Para guardar dados de pagamento no deal:
- `UF_CRM_PARCELAS_TOTAL` — Total de parcelas
- `UF_CRM_PARCELAS_PAGAS` — Parcelas já pagas
- `UF_CRM_VALOR_PARCELA` — Valor de cada parcela
- `UF_CRM_PROX_VENCIMENTO` — Data do próximo vencimento
- `UF_CRM_METODO_PAGAMENTO` — Método (transferência, cartão, etc.)
- `UF_CRM_GATEWAY` — Gateway futuro (direto, stripe_pt, etc.)

