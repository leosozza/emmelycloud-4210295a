

# Tornar Badges Editáveis no Placement Emmely Pay

## Problema

Os badges de **Gateway**, **Método** e **Próximo Vencimento** no placement Emmely Pay são texto estático — não permitem edição. O utilizador quer clicar e alterar o Gateway directamente no placement.

## Alterações

### Ficheiro: `supabase/functions/bitrix24-payment-tab/index.ts`

#### 1. Passar mapa de enumeração para o JS do cliente

Na secção onde os metadados dos campos são resolvidos (linhas ~1968-1988), serializar o mapa `{id: label}` dos campos `UF_CRM_EMMELY_GATEWAY` e `UF_CRM_EMMELY_PAYMENT_METHOD` e injectá-lo como variáveis JS no HTML (`GATEWAY_OPTIONS`, `METHOD_OPTIONS`).

#### 2. Substituir spans estáticos por badges clicáveis (linhas 544-548)

- **Gateway**: `<span>` com cursor pointer + ícone lápis → ao clicar, mostra dropdown inline com as opções (Stripe Portugal, Stripe Brasil, Asaas, Direto)
- **Método**: Mesmo padrão com opções (Cartão, PIX, Boleto, Multibanco, MB Way, SEPA, Direto)
- **Próx. Vencimento**: Ao clicar, mostra `<input type="date">` inline

#### 3. Nova função JS `updateDealField(fieldName, value)`

Chama `bitrix24-send` com `crm.deal.update` para actualizar o campo UF no Bitrix24. Após sucesso, actualiza o texto do badge e a variável `DEAL_RAW_GATEWAY` para que cobranças futuras usem o gateway correcto.

```javascript
async function updateDealField(fieldName, value) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/bitrix24-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      member_id: MEMBER_ID,
      method: 'crm.deal.update',
      params: { id: ENTITY_ID, fields: { [fieldName]: value } }
    })
  });
  return res.json();
}
```

#### 4. CSS para badges editáveis

Cursor pointer, hover com fundo subtil, ícone lápis, e estilos para dropdown/date inline.

### Ficheiro a editar

1. **`supabase/functions/bitrix24-payment-tab/index.ts`** — badges editáveis + JS + CSS + mapa de enumeração

