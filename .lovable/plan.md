

## Plano: Corrigir Carteira e Placement para clientes importados

### Problema 1: Carteira não mostra Deal IDs
A tabela de Clientes (`/bitrix24/carteira`) já mostra `bitrix24_id` (contacto). Mas faltam as colunas de `bitrix24_deal_id` dos `financial_records`. A edge function `bitrix24-fetch-portfolio` não inclui `bitrix24_deal_id` no SELECT dos financial_records, nem retorna esses IDs ao frontend.

### Problema 2: Placement "Emmely Pay" não mostra dados de clientes importados
O placement do Deal (`bitrix24-payment-tab`) encontra parcelas apenas via `payment_transactions.metadata.bitrix_deal_id`. Clientes importados do Access **não têm `payment_transactions`** — têm `financial_records` com `bitrix24_deal_id` preenchido diretamente. O placement ignora completamente este caminho.

### Solução

**Ficheiro 1: `supabase/functions/bitrix24-payment-tab/index.ts`** (Deal view, ~linha 1686)

Adicionar um fallback: se `dealTransactions` e `financialRecords` estiverem vazios, procurar diretamente na tabela `financial_records` pelo campo `bitrix24_deal_id = entityId`. Isso cobre os clientes importados do Access que têm parcelas vinculadas ao deal mas sem `payment_transactions`.

```
// After existing logic (line ~1708), add fallback:
if (financialRecords.length === 0 && dealTransactions.length === 0) {
  // Fallback: Access-imported clients have financial_records with bitrix24_deal_id directly
  const { data: directRecords } = await supabase
    .from("financial_records")
    .select("*")
    .eq("bitrix24_deal_id", String(entityId))
    .order("installment_number", { ascending: true });
  if (directRecords && directRecords.length > 0) {
    financialRecords = directRecords;
  }
}
```

Isso garante que o placement mostra corretamente as parcelas e o status "Quitado" para deals sincronizados.

**Ficheiro 2: `supabase/functions/bitrix24-fetch-portfolio/index.ts`**

No `handleFullPortfolio`, incluir `bitrix24_deal_id` no SELECT dos financial_records e retornar o primeiro `bitrix24_deal_id` encontrado no objeto de cada cliente:

- SELECT: adicionar `bitrix24_deal_id` ao nested query dos financial_records
- Response: adicionar `dealId: firstDealId` ao objeto de cada cliente

**Ficheiro 3: Build errors**

Os erros de build (`Cannot find package 'rollup'`, `QueryClient`, etc.) são pré-existentes e não relacionados com as alterações da Fase 3. Precisam ser resolvidos separadamente — provavelmente um `package.json` com dependências em falta ou versões incompatíveis.

### Resultado
- Carteira mostra o Deal ID do Bitrix24 por cliente
- Placement "Emmely Pay" mostra parcelas e status correto para deals de clientes importados
- Deals "Quitados" aparecem com todas as parcelas pagas no placement

