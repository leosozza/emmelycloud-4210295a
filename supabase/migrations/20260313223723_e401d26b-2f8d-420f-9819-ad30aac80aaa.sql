-- Trigger to auto-invoke queue-worker on new message_queue inserts
CREATE OR REPLACE FUNCTION public.trigger_queue_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/queue-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"triggered_by": "pg_trigger"}'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Create trigger on message_queue
DROP TRIGGER IF EXISTS on_message_queue_insert ON public.message_queue;
CREATE TRIGGER on_message_queue_insert
  AFTER INSERT ON public.message_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_worker();

-- Also create triggers for notifications (these were defined as functions but missing triggers)
DROP TRIGGER IF EXISTS on_lead_created ON public.leads;
CREATE TRIGGER on_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();

DROP TRIGGER IF EXISTS on_payment_status_change ON public.payment_transactions;
CREATE TRIGGER on_payment_status_change
  AFTER INSERT OR UPDATE ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_payment_received();

DROP TRIGGER IF EXISTS on_lead_sla_check ON public.leads;
CREATE TRIGGER on_lead_sla_check
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sla_expiring();

DROP TRIGGER IF EXISTS on_lead_set_sla ON public.leads;
CREATE TRIGGER on_lead_set_sla
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_sla();

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_admin_if_first_user();