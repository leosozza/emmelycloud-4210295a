# Adicionar opção "Cliente escolhe" no Método do Emmely Pay

## Objetivo
Permitir que o utilizador (quem cria a cobrança no Bitrix) opte por deixar o cliente escolher a forma de pagamento diretamente no link da Stripe, em vez de fixar um método.

## Mudanças

### 1. Frontend do iframe (`supabase/functions/bitrix24-payment-tab/index.ts`)
- Nos dropdowns `<select>` de método (formulário de criação, entrada, e edição inline por parcela), adicionar um novo `<option value="customer_choice">Cliente escolhe (Stripe)</option>`.
- Manter as opções existentes (Cartão, Multibanco, MB Way, SEPA, Pix, Boleto).
- No `submitInstallments()` e nos handlers de edição inline, quando `method === "customer_choice"`, gravar como `parcelado_direto` no `financial_records.payment_method` (para não quebrar constraints do enum) mas passar `payment_method: null` no payload enviado a `payment-create`.
  - Alternativa mais limpa: gravar `customer_choice` no `financial_records.payment_method` **apenas se o enum permitir**. Verificar o enum primeiro; se não permitir, usar o fallback acima.
- Regras de validação (CPF/endereço) continuam iguais — `customer_choice` não obriga a nada extra.

### 2. Backend `payment-create` (`supabase/functions/payment-create/index.ts`)
- Já pronto: quando `requestedMethod` é vazio/null, devolve leque completo para a moeda + retry automático que descarta métodos não ativados.
- Adicionar apenas: se `requestedMethod === "customer_choice"`, tratar como vazio (leque completo).

### 3. Backend `payment-create-link` (`supabase/functions/payment-create-link/index.ts`)
- Espelhar: `customer_choice` → sem método específico → leque completo com retry (já existente).

## Verificação do enum
Antes de codar, ler o schema de `financial_records.payment_method` (via `supabase read_query` no `information_schema`) para decidir se `customer_choice` cabe ou se precisamos do fallback `parcelado_direto` com marcador em metadata.

## Fora do âmbito
- Sem alterar aparência do checkout Stripe (é da Stripe).
- Sem mexer em fluxo Asaas/BR — lá o método continua obrigatório.
- Sem mexer no dashboard/relatórios.

## Ficheiros afetados
- `supabase/functions/bitrix24-payment-tab/index.ts`
- `supabase/functions/payment-create/index.ts`
- `supabase/functions/payment-create-link/index.ts`
