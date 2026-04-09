

# Adicionar Flow ao Aceite de Proposta

## Resumo

Adicionar um campo `accept_flow_id` ao robot "Gerar Proposta" (dropdown dinâmico com flows activos) e ao robot "Gerar Contrato". Quando o cliente aceitar a proposta, o sistema dispara automaticamente o flow seleccionado.

## Alterações

### 1. Migração: novo campo na tabela `proposals`

```sql
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accept_flow_id uuid;
```

### 2. `supabase/functions/bitrix24-install/index.ts`

- Carregar flows activos da tabela `flows` (mesmo padrão dos templates):
```typescript
const { data: activeFlows } = await supabase.from("flows").select("id, name").eq("is_active", true).order("name");
const flowOptions: Record<string, string> = { "": "(Não executar flow)" };
(activeFlows || []).forEach((f: any) => { flowOptions[f.id] = f.name; });
```
- Adicionar campo `accept_flow_id` como `select` com `flowOptions` nos robots `emmely_generate_proposal` e `emmely_generate_contract` (nas 2 secções: repair e install)

### 3. `supabase/functions/bitrix24-robot-handler/index.ts`

- Ler `properties.accept_flow_id` e guardar na proposta ao inserir (`accept_flow_id`)

### 4. `supabase/functions/proposal-accept/index.ts`

Após o aceite (depois do bloco Bitrix24 stage), adicionar:
- Se `proposal.accept_flow_id` existir, buscar o lead vinculado → conversation_id
- Chamar `flow-engine` com `conversation_id` e `force_flow_id` definido no `bot_state`, ou invocar directamente a edge function `flow-engine` passando os dados necessários

### Ficheiros a editar

1. **Migração SQL** — `accept_flow_id uuid` na tabela `proposals`
2. **`supabase/functions/bitrix24-install/index.ts`** — dropdown de flows nos robots (4 locais: repair + install × proposta + contrato)
3. **`supabase/functions/bitrix24-robot-handler/index.ts`** — ler e guardar `accept_flow_id`
4. **`supabase/functions/proposal-accept/index.ts`** — disparar flow ao aceitar

