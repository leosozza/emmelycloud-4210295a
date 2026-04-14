CREATE OR REPLACE FUNCTION public.populate_graph_from_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Proposal -> Case
  IF NEW.case_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('proposal', NEW.id::text, 'case', NEW.case_id::text, 'relates_to_case',
            jsonb_build_object('title', NEW.title, 'status', NEW.status))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;