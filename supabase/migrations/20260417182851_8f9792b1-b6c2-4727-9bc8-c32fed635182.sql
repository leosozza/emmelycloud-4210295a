-- Trigger: sync financial_records.status -> Bitrix24 Smart Invoice stage
-- Fires only when status changes AND there's a linked invoice id.
CREATE OR REPLACE FUNCTION public.sync_invoice_status_to_bitrix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_sync_origin text;
BEGIN
  -- Skip if status didn't change
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Skip if no invoice in Bitrix24
  IF NEW.bitrix24_invoice_id IS NULL OR NEW.bitrix24_invoice_id = '' THEN
    RETURN NEW;
  END IF;

  -- Anti-loop: if this update came FROM Bitrix24, skip pushing back
  -- (The inbound handler sets a session-level GUC before updating)
  BEGIN
    v_sync_origin := current_setting('emmely.sync_origin', true);
  EXCEPTION WHEN OTHERS THEN
    v_sync_origin := NULL;
  END;
  IF v_sync_origin = 'bitrix24' THEN
    RETURN NEW;
  END IF;

  -- Read settings (set in DB via ALTER DATABASE … SET)
  BEGIN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key  := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
    v_service_key  := NULL;
  END;

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    -- Settings not configured — skip silently rather than fail the UPDATE.
    RETURN NEW;
  END IF;

  -- Fire async HTTP request via pg_net (non-blocking)
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/bitrix24-sync-invoice-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'financial_record_id', NEW.id,
      'bitrix24_invoice_id', NEW.bitrix24_invoice_id,
      'new_status', NEW.status::text,
      'old_status', OLD.status::text,
      'paid_at', NEW.paid_at,
      'amount', NEW.installment_value
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the UPDATE because of sync errors
  RAISE WARNING '[sync_invoice_status_to_bitrix] error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_invoice_status_to_bitrix ON public.financial_records;
CREATE TRIGGER trg_sync_invoice_status_to_bitrix
AFTER UPDATE OF status ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_status_to_bitrix();