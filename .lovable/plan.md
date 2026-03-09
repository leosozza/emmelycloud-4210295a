

## Plan: Auto-Create Custom Deal Fields During Bitrix24 Installation

### What we're building
Add automatic creation of custom fields (User Fields) on Deals in Bitrix24 during the installation process. These fields will be used by the payment system to track installment groups, payment status, and gateway information.

### Fields to create

| Field Code | Title | Type | Description |
|------------|-------|------|-------------|
| `UF_CRM_EMMELY_PAYMENT_STATUS` | Emmely: Status Pagamento | `enumeration` | pendente, parcial, pago, cancelado |
| `UF_CRM_EMMELY_INSTALLMENT_GROUP` | Emmely: Grupo Parcelas | `string` | UUID linking related Smart Invoices |
| `UF_CRM_EMMELY_GATEWAY` | Emmely: Gateway | `enumeration` | stripe, asaas, direto |
| `UF_CRM_EMMELY_TOTAL_PAID` | Emmely: Total Pago | `double` | Sum of paid installments |
| `UF_CRM_EMMELY_PAYMENT_URL` | Emmely: Link Pagamento | `url` | Checkout URL for current payment |

### Implementation

**Modify `supabase/functions/bitrix24-install/index.ts`:**

Add a new section after badges registration (~line 507) to create custom fields:

```typescript
// --- Create Custom Deal User Fields ---
try {
  const dealUserFields = [
    {
      FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
      USER_TYPE_ID: "enumeration",
      EDIT_FORM_LABEL: { pt: "Status de Pagamento" },
      LIST_COLUMN_LABEL: { pt: "Status Pagamento" },
      LIST: [
        { VALUE: "pendente", SORT: 100, DEF: "Y" },
        { VALUE: "parcial", SORT: 200 },
        { VALUE: "pago", SORT: 300 },
        { VALUE: "cancelado", SORT: 400 },
      ],
      SETTINGS: { DISPLAY: "LIST" },
    },
    {
      FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_GROUP",
      USER_TYPE_ID: "string",
      EDIT_FORM_LABEL: { pt: "Grupo de Parcelas" },
      LIST_COLUMN_LABEL: { pt: "Grupo Parcelas" },
    },
    {
      FIELD_NAME: "UF_CRM_EMMELY_GATEWAY",
      USER_TYPE_ID: "enumeration",
      EDIT_FORM_LABEL: { pt: "Gateway de Pagamento" },
      LIST_COLUMN_LABEL: { pt: "Gateway" },
      LIST: [
        { VALUE: "stripe", SORT: 100 },
        { VALUE: "asaas", SORT: 200 },
        { VALUE: "direto", SORT: 300 },
      ],
    },
    {
      FIELD_NAME: "UF_CRM_EMMELY_TOTAL_PAID",
      USER_TYPE_ID: "double",
      EDIT_FORM_LABEL: { pt: "Total Pago" },
      LIST_COLUMN_LABEL: { pt: "Total Pago" },
    },
    {
      FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_URL",
      USER_TYPE_ID: "url",
      EDIT_FORM_LABEL: { pt: "Link de Pagamento" },
      LIST_COLUMN_LABEL: { pt: "Link Pagamento" },
    },
  ];

  for (const field of dealUserFields) {
    const result = await callBitrix(clientEndpoint, accessToken, "crm.deal.userfield.add", field);
    const errStr = String(result.error || "");
    if (result.error && !errStr.includes("ALREADY") && !errStr.includes("DUPLICATE") && !errStr.includes("FIELD_NAME_DUPLICATED")) {
      console.error(`[INSTALL] UserField ${field.FIELD_NAME} failed:`, result.error);
    } else {
      console.log(`[INSTALL] UserField ${field.FIELD_NAME}: OK`);
      installSummary.userfields_registered.push(field.FIELD_NAME);
    }
  }
  installSummary.installed_modules.push("userfields");
} catch (ufError) {
  console.error("[INSTALL] UserField creation error:", ufError);
}
```

### Changes to install summary
Update `installSummary` object to include:
```typescript
userfields_registered: [],
```

### Files changed
- `supabase/functions/bitrix24-install/index.ts` — add userfields creation block after badges registration

