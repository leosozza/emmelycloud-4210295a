
# Tornar Badges Editáveis no Placement Emmely Pay

## Problema

Os badges de **Gateway**, **Método** e **Próximo Vencimento** no placement `bitrix24-payment-tab` são texto estático. O utilizador quer clicar e editar, especialmente o Gateway (escolher entre Stripe PT, Stripe BR, Asaas, Direto).

## Alterações

### Ficheiro: `supabase/functions/bitrix24-payment-tab/index.ts`

#### 1. HTML — Substituir spans estáticos por elementos clicáveis (linhas 544-548)

Cada badge passa a ter um ícone de lápis e ao clicar abre um dropdown inline (para Gateway e Método) ou um date picker (para Próximo Vencimento):

- **Gateway**: dropdown com opções "Stripe Portugal", "Stripe Brasil", "Asaas", "Direto" (mesmas do `bitrix24-install`)
- **Método**: dropdown com "Cartão", "PIX", "Boleto", "Multibanco", "MB Way", "SEPA", "Direto"
- **Próx. Vencimento**: input date

Ao seleccionar, o valor é enviado ao servidor para actualizar o campo UF no Bitrix24.

#### 2. Variáveis JS — Passar `rawGateway` e `rawMethod` para o script (linha 756)

Já existe `DEAL_RAW_GATEWAY`. Adicionar `DEAL_RAW_METHOD`.

#### 3. JS — Função `updateDealField(fieldName, value)`

Nova função no bloco `<script>` que chama a edge function `bitrix24-update-deal-payment` (ou directamente `bitrix24-send` com `crm.deal.update`) para actualizar o campo UF no deal:

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

Ao seleccionar no dropdown:
- Gateway → `updateDealField('UF_CRM_EMMELY_GATEWAY', selectedEnumId)`
- Método → `updateDealField('UF_CRM_EMMELY_PAYMENT_METHOD', selectedEnumId)`
- Vencimento → `updateDealField('UF_CRM_EMMELY_NEXT_DUE_DATE', selectedDate)`

Após sucesso, actualiza o texto do badge e o `DEAL_RAW_GATEWAY` para que cobranças futuras usem o gateway correcto.

#### 4. CSS — Estilos para badges editáveis

Adicionar cursor pointer, hover com sublinhado, e estilo do dropdown inline.

#### 5. Resolver IDs de enumeração

Como os campos Gateway e Método são do tipo `enumeration`, o servidor armazena IDs numéricos. O HTML já recebe os metadados dos campos (linhas 1970-1983). Passar o mapa de `{id: label}` para o JS do cliente para que o dropdown mostre labels legíveis e envie os IDs correctos.

### Ficheiro a editar

1. **`supabase/functions/bitrix24-payment-tab/index.ts`** — badges editáveis + JS updateDealField + CSS
