
-- 1. Add personality fields to ai_agents
ALTER TABLE public.ai_agents 
  ADD COLUMN IF NOT EXISTS personality_style text DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS communication_tone text DEFAULT 'empathetic',
  ADD COLUMN IF NOT EXISTS strategic_objective text DEFAULT NULL;

-- 2. Create business_rules table
CREATE TABLE public.business_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  field text NOT NULL,
  operator text NOT NULL DEFAULT 'equals',
  value text NOT NULL,
  action_type text NOT NULL DEFAULT 'change_agent',
  action_config jsonb DEFAULT '{}'::jsonb,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access business_rules" ON public.business_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Service role full access business_rules" ON public.business_rules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can read business_rules" ON public.business_rules
  FOR SELECT TO authenticated
  USING (true);
