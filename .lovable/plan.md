
## Diagnóstico

Erro: `null value in column "target_id" of relation "entity_graph" violates not-null constraint`

Causa: ao inserir uma parcela sintética em `financial_records` sem `contract_id` (agora permitido após a migração anterior), o trigger `populate_graph_from_financial` tenta inserir em `entity_graph`:
```
('financial', NEW.id, 'contract', NEW.contract_id::text, 'payment_for', ...)
```
Como `contract_id` é NULL, `target_id` fica NULL → viola NOT NULL.

## Plano

1. **Migração SQL — corrigir o trigger `populate_graph_from_financial`**
   - Recriar a função para só inserir no `entity_graph` quando `NEW.contract_id IS NOT NULL`.
   - Adicionar uma segunda relação opcional: quando existe `bitrix24_deal_id`, inserir `('financial', id, 'bitrix24_deal', deal_id, 'payment_for_deal', …)` — mantém o grafo útil para parcelas vindas só do Bitrix24.

2. **Migração SQL — defesa em profundidade**
   - `ALTER TABLE public.entity_graph ALTER COLUMN target_id ...` fica como está (NOT NULL é correto), mas adicionar guard nos outros 3 triggers (`lead`, `proposal`, `contract`) para evitar repetir o problema:
     - `populate_graph_from_lead`: já verifica `conversation_id IS NOT NULL` ✅
     - `populate_graph_from_proposal`: já verifica `case_id IS NOT NULL` ✅
     - `populate_graph_from_contract`: **não** verifica `proposal_id` — adicionar guard.

3. **Sem alterações no frontend nem na edge function** — o fix é puramente no trigger.

4. **Validar**
   - Após migração, retentar o token `ac511cda-8f50-4ba3-aca6-6ac97a2fd3b4`.
   - Confirmar que parcelas sintéticas são materializadas e o link Stripe é gerado.

## Detalhes técnicos

Nova versão da função:
```sql
CREATE OR REPLACE FUNCTION public.populate_graph_from_financial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('financial', NEW.id::text, 'contract', NEW.contract_id::text, 'payment_for',
            jsonb_build_object('status', NEW.status, 'total_value', NEW.total_value, 'due_date', NEW.due_date))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;

  IF NEW.bitrix24_deal_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('financial', NEW.id::text, 'bitrix24_deal', NEW.bitrix24_deal_id, 'payment_for_deal',
            jsonb_build_object('status', NEW.status, 'total_value', NEW.total_value, 'due_date', NEW.due_date))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
```

E o `populate_graph_from_contract` passa a só inserir para `proposal` se `NEW.proposal_id IS NOT NULL`.

## Resultado esperado

- Parcelas sintéticas (sem contrato local, só com `bitrix24_deal_id`) são materializadas com sucesso.
- O link Stripe é gerado e o cliente consegue pagar.
- O grafo continua a registar a relação útil (financial → bitrix24_deal) em vez de falhar silenciosamente.
