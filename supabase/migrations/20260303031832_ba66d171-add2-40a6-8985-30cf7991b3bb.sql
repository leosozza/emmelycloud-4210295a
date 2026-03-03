
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id UUID,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Service role can insert (from triggers)
CREATE POLICY "Service role can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Index for fast user queries
CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, read_at) WHERE read_at IS NULL;

-- Trigger function: notify on new lead (notifies comerciais)
CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT ur.user_id, 'lead', 'Novo Lead', 'Lead "' || NEW.name || '" foi criado.', 'lead', NEW.id
  FROM public.user_roles ur
  WHERE ur.role = 'comercial' OR ur.role = 'admin';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_lead
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

-- Trigger function: notify on new inbound message (notifies assigned or admins)
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  IF NEW.direction = 'inbound' THEN
    SELECT contact_name INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    SELECT ur.user_id, 'message', 'Nova Mensagem', 'Mensagem de ' || COALESCE(v_conv.contact_name, 'cliente'), 'conversation', NEW.conversation_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin' OR ur.role = 'comercial';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- Trigger function: notify on payment received (notifies financeiros)
CREATE OR REPLACE FUNCTION public.notify_payment_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    SELECT ur.user_id, 'payment', 'Pagamento Recebido', 'Pagamento de ' || NEW.amount || ' ' || NEW.currency || ' confirmado.', 'payment', NEW.id
    FROM public.user_roles ur
    WHERE ur.role = 'financeiro' OR ur.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_payment_received
AFTER UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_received();

-- Trigger function: notify SLA expiring (when lead SLA is set and within 2 hours)
CREATE OR REPLACE FUNCTION public.notify_sla_expiring()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sla_expires_at IS NOT NULL AND NEW.sla_expires_at <= (now() + INTERVAL '2 hours') AND NEW.sla_expires_at > now() THEN
    IF NEW.assigned_commercial_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
      SELECT p.user_id, 'sla', 'SLA a Expirar', 'Lead "' || NEW.name || '" tem SLA a expirar em breve.', 'lead', NEW.id
      FROM public.profiles p WHERE p.id = NEW.assigned_commercial_id;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
      SELECT ur.user_id, 'sla', 'SLA a Expirar', 'Lead "' || NEW.name || '" tem SLA a expirar em breve.', 'lead', NEW.id
      FROM public.user_roles ur WHERE ur.role = 'admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_sla_expiring
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_sla_expiring();
