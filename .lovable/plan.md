

## Plano: Alinhar campos UF do Bitrix24 entre Install, Payment Tab e Update

### Problema Raiz

Existe uma **desconexão total** entre os campos criados na instalação e os campos usados pelas funções de pagamento:

**Install cria (apenas em Deals):**
- `UF_CRM_EMMELY_PAYMENT_STATUS`, `UF_CRM_EMMELY_INSTALLMENT_GROUP`, `UF_CRM_EMMELY_GATEWAY`, `UF_CRM_EMMELY_TOTAL_PAID`, `UF_CRM_EMMELY_PAYMENT_URL`

**update-deal-payment escreve (nunca criados):**
- `UF_CRM_PARCELAS_TOTAL`, `UF_CRM_PARCELAS_PAGAS`, `UF_CRM_VALOR_PARCELA`, `UF_CRM_PROX_VENCIMENTO`, `UF_CRM_METODO_PAGAMENTO`, `UF_CRM_GATEWAY`, `UF_CRM_NOTAS_PAGAMENTO`

Resultado: os campos do payment nunca existem no Bitrix, logo nada é gravado.

Além disso, os campos só são criados em **Deals** — falta suporte para **Leads** e **SPA**.

### Solução

#### 1. Unificar nomenclatura — usar prefixo `UF_CRM_EMMELY_*` em tudo

Campos definitivos (todos criados na instalação):

| Campo | Tipo | Uso |
|---|---|---|
| `UF_CRM_EMMELY_PAYMENT_STATUS` | enumeration | pendente/parcial/pago/cancelado |
| `UF_CRM_EMMELY_INSTALLMENT_GROUP` | string | UUID do grupo de parcelas |
| `UF_CRM_EMMELY_GATEWAY` | enumeration | stripe_pt/stripe_br/asaas/direto |
| `UF_CRM_EMMELY_TOTAL_PAID` | double | Total já pago |
| `UF_CRM_EMMELY_PAYMENT_URL` | url | Link de pagamento |
| `UF_CRM_EMMELY_TOTAL_INSTALLMENTS` | integer | **NOVO** — Nº total de parcelas |
| `UF_CRM_EMMELY_PAID_INSTALLMENTS` | integer | **NOVO** — Nº de parcelas pagas |
| `UF_CRM_EMMELY_INSTALLMENT_VALUE` | double | **NOVO** — Valor da parcela |
| `UF_CRM_EMMELY_NEXT_DUE_DATE` | date | **NOVO** — Próximo vencimento |
| `UF_CRM_EMMELY_PAYMENT_METHOD` | enumeration | **NOVO** — Cartão/PIX/Boleto/MB WAY/Multibanco/Direto |
| `UF_CRM_EMMELY_PAYMENT_NOTES` | string | **NOVO** — Notas de pagamento |

#### 2. Criar campos em Deal, Lead e SPA

Na instalação (`bitrix24-install`):
- `crm.deal.userfield.add` — Deals (já existe, ampliar)
- `crm.lead.userfield.add` — **NOVO** para Leads
- Para SPA: campos UF são criados via `crm.item.userfield.add` com `entityTypeId` — listar SPA types e criar para cada um (ou documentar criação manual)

#### 3. Corrigir `update-deal-payment`

Substituir todos os `UF_CRM_PARCELAS_*` e `UF_CRM_GATEWAY` pelos nomes `UF_CRM_EMMELY_*` corretos para que os dados sejam efetivamente gravados nos campos existentes.

#### 4. Adicionar ação "Verificar/Reparar Campos" no install

Criar endpoint `?action=repair_fields` no `bitrix24-install` (ou nova função) que:
- Lista campos existentes via `crm.deal.userfield.list`
- Compara com lista esperada
- Cria apenas os faltantes (idempotente)
- Retorna relatório: `{ created: [...], already_exists: [...], errors: [...] }`

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Ampliar lista de UF fields com 6 novos campos; criar em Deal + Lead; adicionar ação `repair_fields` |
| `supabase/functions/bitrix24-update-deal-payment/index.ts` | Renomear todos os `UF_CRM_PARCELAS_*` para `UF_CRM_EMMELY_*` |

