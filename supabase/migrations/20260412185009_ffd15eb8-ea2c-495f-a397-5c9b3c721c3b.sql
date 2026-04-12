
-- Tabela de auditoria das automações internas
CREATE TABLE public.automation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_type TEXT NOT NULL,
  entity_id TEXT,
  entity_type TEXT,
  result JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para queries por tipo e data
CREATE INDEX idx_automation_runs_type_date ON public.automation_runs (automation_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

-- Admins e comerciais podem ler
CREATE POLICY "Staff can view automation runs"
  ON public.automation_runs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'comercial')
  );

-- Tabela de configurações das automações
CREATE TABLE public.automation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_type TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view automation settings"
  ON public.automation_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'comercial')
  );

CREATE POLICY "Admins can update automation settings"
  ON public.automation_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed default settings
INSERT INTO public.automation_settings (automation_type, is_enabled, config) VALUES
  ('summary', true, '{"min_messages": 10, "cooldown_hours": 4}'::jsonb),
  ('classify', true, '{"max_age_hours": 24}'::jsonb),
  ('followup', true, '{"inactive_days": 7, "critical_days": 30}'::jsonb),
  ('sentiment', true, '{"message_count": 5, "frustration_threshold": 2}'::jsonb);
