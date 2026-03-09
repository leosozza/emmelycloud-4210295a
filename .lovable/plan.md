

## Plano: Robot de Conversão de Moeda para Bitrix24

### Objetivo
Criar um robot que lê um campo de valor em uma moeda (ex: EUR) e preenche outro campo com o valor convertido para outra moeda (ex: BRL), permitindo orçamentos em Euro serem automaticamente convertidos para Reais.

---

### Implementação

#### 1. Registrar Robot `emmely_convert_currency` em `bitrix24-install/index.ts`

Adicionar ao array `robots` (linha ~585):

```typescript
{
  CODE: "emmely_convert_currency",
  NAME: "Emmely: Converter Moeda",
  PROPERTIES: {
    source_value: { Name: "Valor Original", Type: "double", Required: "Y", Description: "Campo com o valor a converter" },
    source_currency: { Name: "Moeda Origem", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL", USD: "USD" }, Default: "EUR" },
    target_currency: { Name: "Moeda Destino", Type: "select", Required: "Y", Options: { BRL: "BRL", EUR: "EUR", USD: "USD" }, Default: "BRL" },
    spread_percent: { Name: "Spread (%)", Type: "double", Default: "0", Description: "Margem adicional sobre a cotação (ex: 2 = +2%)" },
  },
  RETURN_PROPERTIES: {
    converted_value: { Name: "Valor Convertido", Type: "double" },
    exchange_rate: { Name: "Taxa de Câmbio", Type: "double" },
    rate_date: { Name: "Data da Cotação", Type: "string" },
    error: { Name: "Erro", Type: "string" },
  },
}
```

#### 2. Criar Handler `handleConvertCurrency` em `bitrix24-robot-handler/index.ts`

```typescript
async function handleConvertCurrency(properties: Record<string, any>): Promise<Record<string, string>> {
  const sourceValue = parseFloat(properties.source_value || properties.SOURCE_VALUE || "0");
  const sourceCurrency = (properties.source_currency || properties.SOURCE_CURRENCY || "EUR").toUpperCase();
  const targetCurrency = (properties.target_currency || properties.TARGET_CURRENCY || "BRL").toUpperCase();
  const spreadPercent = parseFloat(properties.spread_percent || properties.SPREAD_PERCENT || "0");

  if (!sourceValue || sourceValue <= 0) {
    return { converted_value: "0", exchange_rate: "0", rate_date: "", error: "Valor inválido" };
  }

  if (sourceCurrency === targetCurrency) {
    return {
      converted_value: String(sourceValue),
      exchange_rate: "1",
      rate_date: new Date().toISOString().split("T")[0],
      error: "",
    };
  }

  try {
    // Usar API gratuita de câmbio (Exchange Rate API ou similar)
    const apiUrl = `https://api.exchangerate.host/latest?base=${sourceCurrency}&symbols=${targetCurrency}`;
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!data.success || !data.rates?.[targetCurrency]) {
      // Fallback para taxas fixas (EUR→BRL, etc.)
      const fallbackRates: Record<string, number> = {
        "EUR_BRL": 6.10,
        "BRL_EUR": 0.164,
        "USD_BRL": 5.50,
        "BRL_USD": 0.182,
        "EUR_USD": 1.08,
        "USD_EUR": 0.926,
      };
      const rateKey = `${sourceCurrency}_${targetCurrency}`;
      const rate = fallbackRates[rateKey] || 1;
      const finalRate = rate * (1 + spreadPercent / 100);
      const converted = sourceValue * finalRate;

      return {
        converted_value: String(Math.round(converted * 100) / 100),
        exchange_rate: String(Math.round(finalRate * 10000) / 10000),
        rate_date: new Date().toISOString().split("T")[0] + " (fallback)",
        error: "",
      };
    }

    const rate = data.rates[targetCurrency];
    const finalRate = rate * (1 + spreadPercent / 100);
    const converted = sourceValue * finalRate;

    return {
      converted_value: String(Math.round(converted * 100) / 100),
      exchange_rate: String(Math.round(finalRate * 10000) / 10000),
      rate_date: data.date || new Date().toISOString().split("T")[0],
      error: "",
    };
  } catch (e) {
    return { converted_value: "0", exchange_rate: "0", rate_date: "", error: String(e) };
  }
}
```

#### 3. Adicionar Case no Switch do Handler Principal

```typescript
case "emmely_convert_currency":
  returnValues = await handleConvertCurrency(properties);
  break;
```

---

### Fluxo de Uso no Bitrix24

```text
┌─────────────────────────────────────────────────────────┐
│  Workflow Bitrix24                                      │
├─────────────────────────────────────────────────────────┤
│  1. Robot "Emmely: Converter Moeda"                     │
│     ├─ Valor Original: {{Negócio.OPPORTUNITY}} (EUR)   │
│     ├─ Moeda Origem: EUR                                │
│     ├─ Moeda Destino: BRL                               │
│     └─ Spread: 2 (%)                                    │
│                                                         │
│  2. Robot "Modificar Negócio"                           │
│     └─ UF_CRM_VALOR_BRL = {{Valor Convertido}}         │
└─────────────────────────────────────────────────────────┘
```

---

### Ficheiros a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| `supabase/functions/bitrix24-install/index.ts` | Adicionar robot `emmely_convert_currency` |
| `supabase/functions/bitrix24-robot-handler/index.ts` | Adicionar handler + case no switch |

