

## Plano: Melhorar Payment Tab — Informações, Ações e Editor de Parcelas

### Problemas Identificados (com base nos screenshots)

1. **Falta de informações no resumo**: Não mostra gateway, data de criação/vencimento, nem método de pagamento
2. **Ações dispersas**: Botões "Editar" e "Dar Baixa" + seletor de fluxo separados — devem ser um dropdown unificado
3. **Modal de edição incompleto**: Falta número de parcelas, recalcular vencimentos, e mostrar valor dual EUR/BRL

### Alterações

**Ficheiro**: `supabase/functions/bitrix24-payment-tab/index.ts`

#### 1. Resumo com informações adicionais
Adicionar ao bloco `.b24-summary` uma linha extra mostrando:
- **Gateway** utilizado (ex: Stripe PT, Asaas)
- **Método** de pagamento (Cartão, PIX, etc.)
- **Próximo vencimento** (data da próxima parcela pendente)
- **Data de criação** da cobrança

```text
┌─────────────────────────────────────────────────┐
│ Emmely Pay — Josivania - WhatsApp               │
│ TOTAL          PAGO           EM ABERTO          │
│ 600,00 €       0,00 €         600,00 €           │
│ ████████████████████████░░░░░░░░░░  0% pago      │
│                                                   │
│ Gateway: Stripe PT  •  Método: Cartão            │
│ Próx. vencimento: 15/04/2026  •  Criado: 09/03   │
└─────────────────────────────────────────────────┘
```

#### 2. Dropdown unificado de ações por parcela
Substituir os botões separados por um único `<select>` + botão "Executar":
- **Dar Baixa** — abre modal de baixa
- **Gerar Link de Pagamento** — chama `payment-create` e mostra link
- **Editar Parcela** — abre modal de edição
- **Enviar Fluxo** — mostra sub-selector de fluxo e dispara

```html
<select id="action-{id}">
  <option value="">Selecionar ação...</option>
  <option value="baixa">✓ Dar Baixa</option>
  <option value="link">🔗 Gerar Link de Pagamento</option>
  <option value="editar">✏ Editar Parcela</option>
  <option value="fluxo">📤 Enviar Fluxo</option>
</select>
<button onclick="executeAction('{id}')">Executar</button>
```

#### 3. Modal de edição melhorado
Adicionar ao modal `edit-overlay`:
- **Nº de Parcelas**: campo para redefinir parcelamento (recalcula valores e datas)
- **Vencimento por parcela**: preview das datas geradas
- **Valor dual**: mostrar valor em EUR (principal) e em BRL (secundário, menor) usando taxa de câmbio fixa (ex: 6.10) ou da API

```text
┌──────────────────────────────────────┐
│ ✏ Editar Parcela                     │
│                                      │
│ Nº DE PARCELAS          │
│ [3]                                  │
│                                      │
│ VALOR DA PARCELA                     │
│ 200,00 €                             │
│ ≈ R$ 1.220,00                        │
│                                      │
│ 1ª PARCELA: 15/04/2026               │
│ 2ª PARCELA: 15/05/2026               │
│ 3ª PARCELA: 15/06/2026               │
│                                      │
│ MÉTODO DE PAGAMENTO                  │
│ [Cartão ▼]                           │
│                                      │
│ NOTAS                                │
│ [________________]                   │
│                                      │
│         [Cancelar]  [Guardar]        │
└──────────────────────────────────────┘
```

#### 4. Dados do Bitrix24 na renderização
Na lógica do servidor (linhas 1030-1047), buscar também os campos UF_CRM_EMMELY_* do deal para popular gateway/método:
```typescript
const gateway = deal.UF_CRM_EMMELY_GATEWAY || "";
const paymentMethod = deal.UF_CRM_EMMELY_PAYMENT_METHOD || "";
```
Passar estes valores para `renderPaymentTab` como novos parâmetros.

### Resumo de Ficheiros

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-payment-tab/index.ts` | Resumo com gateway/datas, dropdown de ações, modal de edição com parcelas e dual currency |

