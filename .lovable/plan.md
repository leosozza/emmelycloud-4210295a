
# Criar Flow de Teste: Proposta Aceita → Mover Deal + Enviar Mensagem

## O que será feito
Inserir directamente na base de dados um flow de teste com 3 nós:
1. **Mensagem de confirmação** — envia ao cliente: "✅ Proposta aceita! Estamos a preparar o seu contrato."
2. **Mover Deal** — move o deal do Bitrix24 para uma etapa configurável (ex: `C5:EXECUTING`)
3. **Mensagem final** — envia: "📝 Em breve receberá o contrato para assinatura digital."

O flow será criado como **activo** e com `trigger_type: "manual"` (só dispara quando chamado por outro sistema, como o `proposal-accept`).

## Detalhes técnicos

### 1. SQL Insert — tabela `flows`
Inserir um novo flow com:
- `name`: "Teste: Proposta Aceita"
- `is_active`: true
- `trigger_type`: "manual"
- `nodes`: 3 nós (message → bitrix_move_deal → message)
- `edges`: ligações sequenciais entre os nós

O nó `bitrix_move_deal` usará a estrutura `bitrixCrm` com:
- `entity`: "deal"
- `operation`: "move"
- `entityId`: `{{bitrix24_deal_id}}` (variável injectada pelo proposal-accept)
- `targetStageId`: `C5:EXECUTING` (pode ser alterado depois no editor visual)

### 2. Verificar proposal-accept injeta variáveis
O `proposal-accept` já dispara o flow via `flow-engine`, mas preciso confirmar se injeta `bitrix24_deal_id` como variável. Se não, será necessário um pequeno ajuste no `proposal-accept` para passar as variáveis da proposta ao flow.

### Ficheiros a alterar
1. **Migration SQL** — INSERT do flow de teste
2. **`supabase/functions/proposal-accept/index.ts`** — garantir que `bitrix24_deal_id` e outras variáveis da proposta são passadas ao flow-engine como `variables`
