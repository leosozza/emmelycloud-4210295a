

## Plano: Modal de Baixa com Juros, Pagamento e Comprovante

### Situação Atual
O botao "Baixa" na Carteira marca a parcela como paga instantaneamente, sem confirmar valores, juros, forma de pagamento ou anexar comprovante.

### Solução
Criar um modal/dialog de confirmacao de baixa que aparece ao clicar "Baixa", com:

1. **Calculo automatico de juros** usando `calculateLateFees` de `src/lib/lateFeeCalc.ts` — se a parcela estiver em atraso, exibir valor original, multa, juros e total atualizado
2. **Forma de pagamento** — select com opcoes do enum existente (`stripe`, `transferencia`, `parcelado_direto`) + opcoes extras comuns (MBWay, Multibanco, PIX, dinheiro)
3. **Valor pago** — input numerico pre-preenchido com o total (com juros se aplicavel), editavel para baixas parciais ou descontos
4. **Data do pagamento** — date picker pre-preenchido com hoje
5. **Comprovante** — upload opcional de ficheiro (imagem/PDF) para o bucket `signatures` no path `payment-proofs/`

### Alteracoes

| Ficheiro | Alteracao |
|---|---|
| `src/pages/Bitrix24App.tsx` | Adicionar estado para modal de baixa (`baixaTarget`), componente inline do dialog com formulario, e refatorar `handleBaixaParcela` para abrir o modal em vez de atualizar diretamente |

### Detalhes Tecnicos

**Estado do modal:**
- `baixaTarget: { fr, clientId } | null` — controla abertura
- Campos do form: `paidAmount`, `paymentDate`, `paymentMethod`, `proofFile`

**Fluxo:**
1. Clicar "Baixa" → abre Dialog com dados pre-preenchidos
2. Se `due_date < hoje` → calcular juros com `calculateLateFees` e mostrar breakdown (multa + juros)
3. Utilizador confirma/edita valores, escolhe forma de pagamento, data, e opcionalmente anexa comprovante
4. Ao confirmar:
   - Se houver ficheiro, upload para bucket `signatures` path `payment-proofs/{fr.id}.{ext}`
   - Update `financial_records` com `status: "paga"`, `paid_at`, `payment_method`, `receipt_url` (se comprovante), e `installment_value` (valor efetivo pago com juros)
   - Refresh dados

**Componentes usados:** Dialog existente (`@/components/ui/dialog`), Input, Select, Calendar/Popover, Button. Import de `calculateLateFees` de `@/lib/lateFeeCalc.ts`.

