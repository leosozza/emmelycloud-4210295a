

# Análise da Implementação vs. Plano de Melhorias

## Estado Actual — O que JÁ está implementado

### Fase 1: Modelo de Dados ✅ COMPLETO
A tabela `proposals` já possui todos os campos de qualificação estruturada:
- `client_gender`, `client_nationality` — qualificação pessoal
- `client_document_type`, `client_document_number`, `client_document_validity`, `client_document_issuer` — identificação estruturada
- `upfront_value`, `installment_value` — detalhamento de pagamento
- Confirmado em `types.ts` (linhas 2609-2651)

### Fase 2: Motor de Templates — PARCIALMENTE implementado

**✅ Feito:**
- `BlockRenderer.tsx` existe e renderiza blocos com placeholders reais
- `PropostaPublica.tsx` já consome `layout_blocks` do template (linha 278-309)
- Suporta blocos de contrato: `clauses`, `signature`, `witnesses`
- `proposal-pdf` renderiza blocos do template (linha 157-173)

**❌ Gaps restantes:**

1. **Placeholders incompletos no `BlockRenderer.tsx`** — `buildPlaceholders()` (linha 56-76) NÃO inclui os novos campos:
   - Faltam: `{cliente.nacionalidade}`, `{cliente.tipo_documento}`, `{cliente.numero_documento}`, `{cliente.validade_documento}`, `{cliente.orgao_emissor}`, `{cliente.tratamento}`, `{valor_entrada}`, `{valor_parcela}`

2. **`ClientInfoBlock` no `BlockRenderer.tsx`** (linha 124-163) — Mostra apenas nome/email/telefone/documento/morada. Não mostra os campos estruturados (nacionalidade, tipo doc, validade, emissor, tratamento).

3. **`proposal-pdf` client_info block** (linha 49-66) — Mesmo problema: só renderiza os 5 campos antigos. Não usa os novos campos estruturados.

4. **`proposal-pdf` não renderiza blocos de contrato** — Faltam cases para `clauses`, `signature`, `witnesses` (linha 119: `default: return ""`)

5. **`PaymentBlock` no `BlockRenderer.tsx`** (linha 225-256) — Não usa `upfront_value` / `installment_value`. Calcula parcela como `value/installments`, ignorando a entrada separada.

6. **Build error**: `replaceAll` em `BlockRenderer.tsx:82` — `tsconfig.app.json` tem `lib: ES2020` mas `replaceAll` precisa de `ES2021`.

### Fase 3: Biblioteca de Templates — NÃO implementado
- Não há templates pré-criados na BD (os 25 modelos do Bitrix24 não foram migrados)
- Sem modelo de contrato mestre com cláusulas padrão
- Este ponto é de conteúdo/dados, não de código

### Fase 4: UX/UI — MAIORITARIAMENTE implementado

**✅ Feito:**
- `PropostaForm.tsx` já tem campos de género, nacionalidade, tipo/número/validade/emissor de documento
- `PropostaPublica.tsx` já tem fluxo de aceite → assinatura com redirect
- Template loader e service loader funcionais

**❌ Gaps:**
- O fluxo de assinatura não mostra o contrato completo renderizado antes de assinar (o `SignContract.tsx` mostra campos de assinatura mas não o documento)

---

## Plano de Correção (o que falta fazer)

### 1. Fix build error — `replaceAll` (CRÍTICO)
Alterar `tsconfig.app.json` lib de `ES2020` para `ES2021` (ou usar `.replace()` com regex global em `BlockRenderer.tsx`).

### 2. Expandir placeholders no `BlockRenderer.tsx`
Adicionar ao `buildPlaceholders()`:
```
{cliente.tratamento}, {cliente.nacionalidade}, {cliente.tipo_documento},
{cliente.numero_documento}, {cliente.validade_documento}, {cliente.orgao_emissor},
{valor_entrada}, {valor_parcela}, {valor_total}
```

### 3. Atualizar `ClientInfoBlock` no `BlockRenderer.tsx`
Mostrar todos os campos estruturados quando disponíveis (nacionalidade, tipo doc, número, validade, emissor, tratamento).

### 4. Atualizar `PaymentBlock` no `BlockRenderer.tsx`
Usar `upfront_value` e `installment_value` quando disponíveis, em vez de calcular `value/installments`.

### 5. Adicionar blocos de contrato ao `proposal-pdf`
Implementar cases `clauses`, `signature`, `witnesses` na função `renderBlockToHtml()`.

### 6. Atualizar `client_info` no `proposal-pdf`
Renderizar os campos estruturados de identificação no PDF.

### 7. Atualizar `payment` no `proposal-pdf`
Usar `upfront_value` e `installment_value`.

### Ficheiros a alterar
1. `tsconfig.app.json` — lib `ES2021`
2. `src/lib/templates/BlockRenderer.tsx` — placeholders + ClientInfoBlock + PaymentBlock
3. `supabase/functions/proposal-pdf/index.ts` — client_info + payment + clauses/signature/witnesses

### Resumo
O modelo de dados está **100% completo**. O frontend do formulário está **completo**. A renderização pública e PDF estão **~60% completas** — faltam os novos campos e os blocos de contrato no PDF. A biblioteca de templates (conteúdo) está **0%** mas é um passo de dados, não de código.

