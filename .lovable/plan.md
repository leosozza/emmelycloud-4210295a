

## Plano: Edição Avançada de Parcelas no Payment Tab (Placement Bitrix24)

### Problema
O Payment Tab atual permite apenas "Dar Baixa" simples (confirmar pagamento integral). Não suporta:
- Editar valor da parcela, vencimento ou método de pagamento
- Baixa parcial com desconto/abatimento (ex: deve 100, negociou 70, abate 30)
- Anexar comprovante de pagamento
- Indicação visual de campos faltantes (vencimento, método, etc.)

### Solução

Tudo dentro do ficheiro `supabase/functions/bitrix24-payment-tab/index.ts` (é HTML inline servido como iframe).

#### 1. Indicadores de campos faltantes
Cada parcela mostra ícones de alerta (⚠) ao lado de campos vazios: vencimento, método de pagamento, valor. Borda laranja no card quando há campos em falta.

#### 2. Modal "Editar Parcela"
Botão "✏ Editar" em cada parcela pendente abre modal com:
- **Valor da parcela** (editável)
- **Data de vencimento** (editável)
- **Método de pagamento** (select: Cartão, PIX, Boleto, Direto)
- **Notas** (texto livre)

Ao guardar: PATCH no `payment-create` para atualizar a transaction + chamada BX24 para atualizar Smart Invoice se existir.

#### 3. Modal "Dar Baixa" melhorado
Substitui o `confirm()` atual por modal completo:
- **Valor total da parcela** (readonly, informativo)
- **Valor efetivamente pago** (editável, pode ser menor)
- **Desconto/Abatimento** (calculado automaticamente: parcela - pago)
- **Justificativa do desconto** (select: Abatimento, Desconto comercial, Quitação antecipada, Outro + texto)
- **Data do pagamento** (default: hoje)
- **Comprovante** (upload de imagem/PDF via input file, convertido em base64 e enviado ao storage)

Ao confirmar: 
- Atualiza transaction com `status: confirmed`, `paid_amount`, `discount_amount`, `discount_reason`
- Atualiza Smart Invoice no Bitrix24 para stage "Pago"
- Upload do comprovante para storage bucket `signatures` (reutilizado) com path `payment-proofs/{tx_id}.{ext}`
- Grava URL do comprovante na metadata da transaction

#### 4. Backend: estender PATCH do `payment-create`
Aceitar campos adicionais no PATCH:
- `amount_update` — novo valor da parcela
- `due_date_update` — nova data de vencimento
- `payment_method_update` — novo método
- `paid_amount` — valor efetivamente pago (para baixa parcial)
- `discount_amount` — valor do desconto
- `discount_reason` — justificativa
- `proof_url` — URL do comprovante
- `notes` — notas adicionais

#### 5. Fluxo de Baixa com Desconto

```text
Parcela: 100€  →  Valor Pago: 70€  →  Desconto: 30€
                                        Motivo: "Quitação antecipada"
                                        Comprovante: [upload]
                                        [Confirmar Baixa]
```

Resultado no Supabase: `status=confirmed, amount=100, metadata.paid_amount=70, metadata.discount=30, metadata.discount_reason="Quitação antecipada", metadata.proof_url="..."`

### Ficheiros a Modificar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/bitrix24-payment-tab/index.ts` | +modal editar, +modal baixa avançada, +indicadores faltantes, +upload comprovante, +CSS |
| `supabase/functions/payment-create/index.ts` | Estender PATCH com campos de edição e baixa parcial |

