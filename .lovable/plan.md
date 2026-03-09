
## Plano: Corrigir Nomes dos Campos UF + Cores do Payment Tab

### Problemas Identificados

1. **Nomes dos campos em inglês**: Os valores das listas (LIST) nos campos UF estão em inglês ("card", "pix", "pendente", "parcial", etc.) — devem estar em português com labels legíveis.

2. **Campo "Nº Parcelas" como inteiro**: O campo `UF_CRM_EMMELY_TOTAL_INSTALLMENTS` é `integer` (campo livre). O utilizador quer uma **lista/enumeração** com opções de 1 a 12 para fácil seleção no Bitrix24.

3. **Cores vermelhas no Payment Tab**: Os botões (`b24-btn-emmely`) usam `#722F37` (bordeaux/vermelho). O Bitrix24 utiliza tons de azul (`#2fc6f6` como cor de destaque). O tema deve alinhar com a paleta azul do Bitrix24.

### Solução

#### 1. `bitrix24-install/index.ts` — Labels em Português + Campo Parcelas como Lista

**Campos afetados:**

| Campo | Problema | Correção |
|---|---|---|
| `UF_CRM_EMMELY_PAYMENT_STATUS` | LIST: "pendente", "parcial", "pago", "cancelado" | LIST: "Pendente", "Parcial", "Pago", "Cancelado" |
| `UF_CRM_EMMELY_GATEWAY` | LIST: "stripe_pt", "stripe_br", "asaas", "direto" | LIST: "Stripe Portugal", "Stripe Brasil", "Asaas", "Direto" |
| `UF_CRM_EMMELY_PAYMENT_METHOD` | LIST: "card", "pix", "boleto", "mb_way", etc. | LIST: "Cartão", "PIX", "Boleto", "MB Way", "Multibanco", "Débito SEPA", "Direto" |
| `UF_CRM_EMMELY_TOTAL_INSTALLMENTS` | `integer` | `enumeration` com LIST de 1 a 12 ("1 Parcela", "2 Parcelas", ..., "12 Parcelas") |

#### 2. `bitrix24-payment-tab/index.ts` — Cores alinhadas ao Bitrix24

Substituir referências ao vermelho `#722F37` por azul `#2067b0` (cor de link/acção do Bitrix24):

| Elemento | Cor Atual | Cor Nova |
|---|---|---|
| `.b24-btn-emmely` | `#722F37` | `#2067b0` |
| Botão "Dar Baixa" inline `background:#589731` | verde (OK) | manter verde (é confirmação) |
| `--progress-fill` | `#2fc6f6` | manter (já é azul Bitrix) |

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-install/index.ts` | Traduzir LIST values para PT; converter `TOTAL_INSTALLMENTS` de integer para enumeration 1-12 |
| `supabase/functions/bitrix24-payment-tab/index.ts` | Mudar `#722F37` para `#2067b0` nos botões |
