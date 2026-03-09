

## Plano: Revisão Completa do Fluxo de Pagamentos

### Análise do Estado Atual

**Gateways suportados:**
- Stripe (PT/BR) ✅
- Asaas (BR) ✅
- Direto (crediário próprio) ✅

**Métodos de pagamento por região:**
- **Stripe PT**: card, multibanco, mb_way, sepa_debit, link
- **Stripe BR**: card, boleto, pix, link
- **Asaas**: pix, boleto, card (credit_card)

### Problemas Identificados

1. **Robot `emmely_create_charge`** — opções de gateway limitadas:
   - Atual: `auto`, `stripe`, `asaas`
   - **Falta**: `stripe_pt`, `stripe_br` como opções explícitas

2. **Robot `emmely_create_charge`** — métodos de pagamento incompletos:
   - Atual: `card`, `pix`, `boleto`, `direto`
   - **Falta**: `multibanco`, `mb_way`, `sepa_debit`, `link`

3. **Campo `UF_CRM_EMMELY_GATEWAY`** — enumeração desatualizada:
   - Atual: `stripe`, `asaas`, `direto`
   - **Falta**: `stripe_pt`, `stripe_br`

4. **Lógica de seleção de métodos** — Ok em `payment-create`, mas robot não expõe todas opções

---

### Alterações Propostas

#### 1. Atualizar Robot `emmely_create_charge` em `bitrix24-install/index.ts`

```typescript
{
  CODE: "emmely_create_charge",
  NAME: "Emmely: Criar Cobrança",
  PROPERTIES: {
    amount: { Name: "Valor", Type: "double", Required: "Y" },
    currency: { Name: "Moeda", Type: "select", Options: { EUR: "EUR", BRL: "BRL" }, Default: "EUR" },
    gateway: { 
      Name: "Gateway", 
      Type: "select", 
      Options: { 
        auto: "Automático", 
        stripe_pt: "Stripe Portugal", 
        stripe_br: "Stripe Brasil", 
        asaas: "Asaas (Brasil)", 
        direto: "Crediário Próprio" 
      }, 
      Default: "auto" 
    },
    payment_method: { 
      Name: "Método de Pagamento", 
      Type: "select", 
      Options: { 
        card: "Cartão",
        multibanco: "Multibanco (PT)",
        mb_way: "MB WAY (PT)",
        sepa_debit: "Débito SEPA (PT)",
        pix: "PIX (BR)",
        boleto: "Boleto (BR)",
        link: "Link de Pagamento",
        direto: "Recebimento Direto"
      }, 
      Default: "card" 
    },
    // ... restantes campos
  },
}
```

#### 2. Atualizar campo `UF_CRM_EMMELY_GATEWAY` em `bitrix24-install/index.ts`

```typescript
{
  FIELD_NAME: "UF_CRM_EMMELY_GATEWAY",
  USER_TYPE_ID: "enumeration",
  LIST: [
    { VALUE: "stripe_pt", SORT: 100 },
    { VALUE: "stripe_br", SORT: 200 },
    { VALUE: "asaas", SORT: 300 },
    { VALUE: "direto", SORT: 400 },
  ],
}
```

#### 3. Atualizar `payment-create/index.ts` — melhorar lógica de métodos regionais

Já está bem implementado, mas vamos adicionar suporte a métodos individuais quando passados explicitamente:

```typescript
// Se payment_method específico foi solicitado, incluí-lo na lista
if (body.payment_method && body.payment_method !== "card") {
  const requestedMethod = body.payment_method;
  if (!paymentMethods.includes(requestedMethod)) {
    paymentMethods.push(requestedMethod);
  }
}
```

#### 4. Atualizar `bitrix24-robot-handler/index.ts` — passar método correto

Atualizar `handleCreateCharge` para mapear corretamente os métodos por região:

```typescript
// Determinar payment_method baseado no gateway selecionado
let effectivePaymentMethod = paymentMethod;
if (paymentMethod === "card" && (companyGateway === "asaas")) {
  effectivePaymentMethod = "card"; // Asaas usa CREDIT_CARD
} else if (["multibanco", "mb_way", "sepa_debit"].includes(paymentMethod) && companyGateway !== "stripe_pt" && companyGateway !== "stripe") {
  effectivePaymentMethod = "card"; // Fallback para gateways não-PT
}
```

---

### Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `supabase/functions/bitrix24-install/index.ts` | Robot `emmely_create_charge` + UserField `UF_CRM_EMMELY_GATEWAY` |
| `supabase/functions/bitrix24-robot-handler/index.ts` | Lógica de mapeamento gateway → método |
| `supabase/functions/payment-create/index.ts` | Pequenos ajustes para métodos explícitos |

---

### Credenciais Necessárias (tabela `integration_credentials`)

| Provider | Key | Descrição |
|----------|-----|-----------|
| `stripe_pt` | `STRIPE_SECRET_KEY` | Stripe Portugal (EUR) |
| `stripe_br` | `STRIPE_SECRET_KEY` | Stripe Brasil (BRL) |
| `asaas` | `ASAAS_API_KEY` | Asaas Brasil (alternativa) |

---

### Resumo Visual

```text
┌──────────────────────────────────────────────────────────┐
│                  ROBOT EMMELY_CREATE_CHARGE              │
├──────────────────────────────────────────────────────────┤
│  Gateway:                                                │
│  ├─ stripe_pt → card, multibanco, mb_way, sepa, link    │
│  ├─ stripe_br → card, boleto, pix, link                 │
│  ├─ asaas     → pix, boleto, card                       │
│  └─ direto    → (sem gateway externo)                   │
├──────────────────────────────────────────────────────────┤
│  Métodos de Pagamento (todos disponíveis):              │
│  card | multibanco | mb_way | sepa_debit | pix |        │
│  boleto | link | direto                                 │
└──────────────────────────────────────────────────────────┘
```

