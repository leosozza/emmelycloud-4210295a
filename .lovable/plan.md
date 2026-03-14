

## Plano: Limpar dados e corrigir mapeamento de colunas na importação

### 1. Limpeza da base de dados

Apagar **todos** os registos importados (`sync_source = 'access_import'`), independentemente da data, usando DELETE em cascata:
- `financial_records` → `contracts` → `proposals` → `cases` → `leads`
- Manter `clients` (serão actualizados via upsert)

### 2. Correcções no `import-access-data/index.ts`

#### a) Separador da PARCELA: ";" em vez de "/"
A coluna L usa formato `1;2` (parcela 1 de 2). O código actual faz `split("/")`. Corrigir para suportar ambos os separadores (`/` e `;`).

```text
"1;2" → installmentNumber=1, installmentTotal=2
"2;2" → installmentNumber=2, installmentTotal=2
```

#### b) Usar `totalInstallments` da PARCELA (não do `installments.length`)
Actualmente `totalInstallments = installments.length` (conta linhas no grupo). Deve usar o valor do campo PARCELA (segundo número) como total real de parcelas na proposta.

#### c) Mapear STATUS para badge no Bitrix24
Actualmente o Deal só tem `STAGE_ID: "WON"` ou `"NEW"`. Melhorar:
- **QUITADO** → `STAGE_ID: "WON"` (ganho/fechado)
- **ABERTO/pendente** → `STAGE_ID: "NEW"`
- **ATRASADO** → `STAGE_ID: "NEW"` + criar **badge na timeline** do Deal com texto "⚠️ Parcela(s) em atraso"

Nas Smart Invoices (Type 31), manter mapeamento existente + adicionar para ATRASADO um stageId distinto se disponível.

#### d) Confirmar mapeamentos (já correctos)
| Coluna Excel | Campo RawHonorario | Uso |
|---|---|---|
| F (Data fecho) | `DATA` | `created_at` de toda a cadeia |
| G (Valor total) | `VALOR` | `totalValue` na proposta e deal |
| K (Vencimento 1ª parcela) | `DATA_VENC` | `due_date` do financial_record |
| L (Parcela) | `PARCELA` | `installment_number/total` |
| M (Valor parcela) | `VALOR_PARCELA` | `installment_value` |
| O (Já pago) | `TOTALPAGO` | Detectar pagamento parcial |
| P (Data pgto) | `DATAPGTO` | `paid_at` |
| Q (Status) | `STATUS` | `status` + badge Bitrix |

### Ficheiros a modificar

| Ficheiro | Acção |
|---|---|
| `supabase/functions/import-access-data/index.ts` | Fix PARCELA split (`;` e `/`), usar total da parcela em vez de `length`, adicionar badge Bitrix para status ATRASADO |
| Base de dados | DELETE cascata de todos os `access_import` |

### Lógica da badge Bitrix24

Para cada Deal com parcelas em atraso, após criar as Smart Invoices, chamar `crm.timeline.comment.add` com uma mensagem indicando quantas parcelas estão atrasadas e o valor em dívida. Isto aparece directamente na timeline do negócio.

