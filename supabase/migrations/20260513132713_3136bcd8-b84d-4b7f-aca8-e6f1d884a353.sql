
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bitrix_assigned_user_id text;
CREATE INDEX IF NOT EXISTS idx_leads_bitrix_assigned_user_id ON public.leads(bitrix_assigned_user_id) WHERE bitrix_assigned_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_agent_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  bitrix_user_id text NOT NULL,
  bitrix_user_name text,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, bitrix_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_users_agent ON public.ai_agent_users(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_users_bitrix ON public.ai_agent_users(bitrix_user_id);

ALTER TABLE public.ai_agent_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read agent users"
  ON public.ai_agent_users FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin manages agent users insert"
  ON public.ai_agent_users FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admin manages agent users update"
  ON public.ai_agent_users FOR UPDATE
  TO authenticated USING (public.is_admin());

CREATE POLICY "Admin manages agent users delete"
  ON public.ai_agent_users FOR DELETE
  TO authenticated USING (public.is_admin());
