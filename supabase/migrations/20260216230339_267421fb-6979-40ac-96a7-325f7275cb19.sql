
-- Fix search_path on functions flagged by linter
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_lead_sla()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sla_expires_at IS NULL THEN
    NEW.sla_expires_at = now() + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;
