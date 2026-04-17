CREATE OR REPLACE FUNCTION public.populate_graph_from_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.populate_graph_from_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.proposal_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('contract', NEW.id::text, 'proposal', NEW.proposal_id::text, 'contract_for',
            jsonb_build_object('status', NEW.status, 'signed_at', NEW.signed_at))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;

  IF NEW.case_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('contract', NEW.id::text, 'case', NEW.case_id::text, 'contract_for_case',
            jsonb_build_object('status', NEW.status))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;