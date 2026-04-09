

# Melhorar Robot de Propostas: Produtos do Bitrix24 + Moeda + Etapa no Aceite

## Problemas Identificados

1. **Produtos**: O robot busca produtos da tabela local `services` (UUIDs), mas deveria buscar do catálogo do Bitrix24 via `crm.product.get` quando o campo `product_ids` tem IDs numéricos do Bitrix
2. **Moeda**: O valor é sempre mostrado com `€` hardcoded. Deveria ler o `CURRENCY_ID` do deal/lead no Bitrix24 e usar o símbolo correcto (€ para EUR, R$ para BRL, etc.)
3. **Produtos na proposta pública**: A página `/proposta/:token` não lista os produtos individuais — mostra apenas a descrição como texto corrido
4. **Etapa do deal ao aceitar**: Ao aceitar a proposta, o deal no Bitrix24 deveria mover para uma etapa configurável (actualmente só actualiza o `funnel_stage` local)

## Alterações

### 1. Migração: Adicionar campos `products_json` e `currency` à tabela `proposals`

```sql
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS products_json jsonb DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS bitrix24_deal_id text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accept_stage_id text;
```

- `products_json`: Array JSON com `[{name, quantity, price, total, description}]` — dados snapshot dos produtos
- `currency`: Moeda do deal (EUR, BRL, USD...)
- `bitrix24_deal_id`: ID do deal no Bitrix24 para poder mover de etapa ao aceitar
- `accept_stage_id`: ID da etapa do funil para onde o deal deve ir ao ser aceite

### 2. `supabase/functions/bitrix24-robot-handler/index.ts` — handleGenerateProposal

**Moeda**: Após buscar a entidade (linha 482), ler `entity.CURRENCY_ID` (ex: `"EUR"`, `"BRL"`). Usar para formatar os valores na WhatsApp message.

**Produtos do Bitrix24**: O bloco actual (linha 586-605) já busca `crm.deal.productrows.list`. Melhorar para:
- Buscar descrição de cada produto via `crm.product.get` com o `PRODUCT_ID` de cada row
- Guardar o array completo em `productsJson` para inserir na proposta

**Guardar na proposta**: Ao inserir (linha 705-726), adicionar `products_json`, `currency`, `bitrix24_deal_id` e `accept_stage_id`.

**Novo campo no robot**: Adicionar `accept_stage_id` como parâmetro do robot para o utilizador escolher a etapa destino.

### 3. `supabase/functions/bitrix24-install/index.ts` — Registo do robot

Adicionar o campo `accept_stage_id` ao robot `emmely_generate_proposal`:
```
accept_stage_id: { Name: "Etapa ao Aceitar", Type: "string", 
  Description: "ID da etapa do funil para onde o deal move quando o cliente aceita (ex: C5:WON). Se vazio, não altera a etapa." }
```

### 4. `supabase/functions/proposal-accept/index.ts` — Mover deal no Bitrix24

Após aceitar a proposta, se `proposal.bitrix24_deal_id` existir:
1. Buscar a integração Bitrix24 activa
2. Se `proposal.accept_stage_id` existir, chamar `crm.deal.update` com `STAGE_ID: accept_stage_id`
3. Caso contrário, não alterar a etapa do deal

### 5. `src/pages/PropostaPublica.tsx` — Listar produtos

Após a secção "O Processo Inclui", adicionar secção "Produtos / Serviços" que renderiza `proposal.products_json` como tabela:

| Produto | Qtd | Preço | Total |
|---------|-----|-------|-------|
| Nome    | 2   | €500  | €1000 |

Usar o campo `currency` para mostrar o símbolo correcto (mapa: EUR→€, BRL→R$, USD→$).

### 6. WhatsApp message — usar símbolo correcto

Na formatação da mensagem WhatsApp (linhas 759, 598), substituir `€` hardcoded pelo símbolo da moeda do deal.

## Ficheiros a editar

1. **Migração SQL** — novos campos na tabela `proposals`
2. **`supabase/functions/bitrix24-robot-handler/index.ts`** — buscar moeda do deal, enriquecer produtos do Bitrix24, guardar `products_json`/`currency`/`bitrix24_deal_id`/`accept_stage_id`, formatar moeda
3. **`supabase/functions/bitrix24-install/index.ts`** — novo campo `accept_stage_id` no robot
4. **`supabase/functions/proposal-accept/index.ts`** — mover deal de etapa no Bitrix24
5. **`src/pages/PropostaPublica.tsx`** — tabela de produtos + símbolo de moeda dinâmico

