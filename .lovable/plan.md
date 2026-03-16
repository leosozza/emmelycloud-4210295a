

## Problema

Ao criar/atualizar Deals no Bitrix24 durante a Fase 3, o sistema **não vincula produtos** do catálogo de produtos do Bitrix24. Atualmente:

1. **Deals**: Nenhum produto é adicionado — apenas o campo `OPPORTUNITY` é definido com o valor total
2. **Faturas (Smart Invoices)**: Produtos são adicionados apenas por nome (`PRODUCT_NAME`) sem `PRODUCT_ID`, ou seja, sem vínculo ao catálogo real

O catálogo do Bitrix24 tem ~60 produtos com IDs específicos (ex: ID 11 = "Autorização de Residência pelo Estudo (Dispensa de Visto)"). Os cases locais usam títulos abreviados (ex: "ESTUDO", "NACIONALIDADE FILHO OU NETO").

## Plano

### 1. Popular a tabela `services` com o catálogo do Bitrix24

Criar uma migração SQL para inserir os ~60 produtos exportados, mapeando `bitrix24_id` ao ID do catálogo Bitrix24. Exemplo:

```sql
INSERT INTO services (name, currency, value, bitrix24_id) VALUES
('Autorização de Residência pelo Estudo (Dispensa de Visto)', 'EUR', 600, '11'),
('Reagrupamento Familiar e Obtenção da Residência', 'EUR', 600, '13'),
...
```

### 2. Criar tabela de mapeamento case_title → service

Como os títulos dos cases são abreviados (ex: "ESTUDO COM DISPENSA DE VISTO") e os nomes dos produtos Bitrix são completos, criar um mapeamento manual na edge function. Mapa de ~50 entries ligando case titles aos `bitrix24_id` dos produtos.

### 3. Adicionar product rows ao Deal após criação

No `sync_single_client`, após `crm.deal.add`, chamar `crm.deal.productrows.set` com os produtos correspondentes:

```typescript
// Após criar o deal
if (dealId && info.services.length > 0) {
  const productRows = info.services.map(svc => {
    const productId = serviceNameToBitrixId(svc);
    return {
      PRODUCT_ID: productId || 0,
      PRODUCT_NAME: svc,
      PRICE: contractValue,
      QUANTITY: 1,
    };
  });
  await bitrixCall("crm.deal.productrows.set", { id: dealId, rows: productRows });
}
```

### 4. Corrigir product rows nas Faturas

Nas faturas (Smart Invoices), adicionar `PRODUCT_ID` quando disponível, para vincular ao catálogo real em vez de usar apenas o nome em texto.

### Ficheiros alterados

- **SQL Migration**: Inserir ~60 serviços na tabela `services` com `bitrix24_id`
- **`supabase/functions/import-access-data/index.ts`**: Adicionar mapeamento case_title→product_id, chamar `crm.deal.productrows.set` após criar deal, e incluir `PRODUCT_ID` nos product rows das faturas

