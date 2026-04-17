CREATE OR REPLACE FUNCTION public.sync_invoice_status_to_bitrix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text := 'https://qohnsluvhyziovfynzlu.supabase.co';
  v_service_key text;
  v_sync_origin text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.bitrix24_invoice_id IS NULL OR NEW.bitrix24_invoice_id = '' THEN
    RETURN NEW;
  END IF;

  -- Anti-loop: skip if change came from Bitrix24
  BEGIN
    v_sync_origin := current_setting('emmely.sync_origin', true);
  EXCEPTION WHEN OTHERS THEN
    v_sync_origin := NULL;
  END;
  IF v_sync_origin = 'bitrix24' THEN
    RETURN NEW;
  END IF;

  -- Read service role key from vault
  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    -- Fallback: silently skip when key not configured. Edge function can also be
    -- triggered from app code if needed.
    RAISE WARNING '[sync_invoice_status_to_bitrix] service_role_key not in vault — skipping';
    RETURN NEW;
  END IF;

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
  RAISE WARNING '[sync_invoice_status_to_bitrix] error: %', SQLERRM;
  RETURN NEW;
END;
$function$;