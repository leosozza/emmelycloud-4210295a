

# Configurações — Aba de Regras de Juros + Comprovante por Parcela

## O que falta

1. **Página de Configurações** (`/configuracoes`) só tem "Aparência" — falta uma secção dedicada às regras de cálculo de juros de atraso
2. **Comprovante de controlo de parcelas** — após cada baixa, não é gerado um PDF/comprovante com o estado de todas as parcelas do deal (como o PDF do Access que foi partilhado)

## Plano

### 1. Adicionar secção "Encargos por Atraso" à página Configurações

**Ficheiro:** `src/pages/Configuracoes.tsx`

Mover o componente `LateFeeConfigCard` que já existe em `Integracoes.tsx` (linhas 900-1019) para a página de Configurações como uma secção dedicada, com:

- **Configuração**: Multa fixa (%), Juros mensais (%), Limite máx. dias, Tolerância (dias)
- **Fórmulas explicativas** (como nas imagens partilhadas):
  - `Multa = Valor Parcela × 10%`
  - `Juros = Valor Parcela × 1% × (Dias em Atraso / 30)`
  - `Encargo Total = Multa + Juros`
- **Simulador em tempo real** (já existe no componente) — valor da parcela + dias de atraso → resultado
- **Botão guardar** → persiste em `payment_gateway_config` (gateway = `late_fees`)

Organizar a página com tabs: **Aparência** | **Encargos**

### 2. Gerar comprovante PDF após cada baixa no placement

**Ficheiro:** `supabase/functions/bitrix24-payment-tab/index.ts`

Após confirmar a baixa com sucesso (linha ~1297), gerar um comprovante HTML para impressão/download com o layout do PDF partilhado:

```text
┌───────────────────────────────────┐
│ EMMELY FERNANDES ADVOCACIA        │
│ Controle de Parcelas              │
│                                   │
│ Cliente: NOME                     │
│ Serviço: TIPO                     │
│                                   │
│ Parcela | Vencimento | Pagamento  │
│         | Juros | Valor | Status  │
│ ────────────────────────────────  │
│ 1/6     | 05/03 | 05/03 | PAGO   │
│ 2/6     | 05/04 | —     | PEND   │
│ ...                               │
│                                   │
│ Morada | Tel | Email | Site       │
└───────────────────────────────────┘
```

- Botão "Gerar Comprovante" aparece ao lado de cada parcela paga
- Abre janela de impressão com HTML formatado (mesmo padrão do `exportToPDF`)
- Inclui TODAS as parcelas do deal (pagas e pendentes), com coluna de juros e valor pago
- Dados do escritório (morada, telefone, email) puxados de configuração ou hardcoded

### Ficheiros a editar

1. **`src/pages/Configuracoes.tsx`** — adicionar tabs + secção de encargos com config, fórmulas e simulador
2. **`supabase/functions/bitrix24-payment-tab/index.ts`** — botão "Comprovante" por parcela paga + geração de HTML para impressão

