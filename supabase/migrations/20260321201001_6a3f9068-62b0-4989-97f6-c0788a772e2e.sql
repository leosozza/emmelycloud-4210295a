
-- Table for Bitrix24 user permissions per module
CREATE TABLE public.bitrix24_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.bitrix24_integrations(id) ON DELETE CASCADE NOT NULL,
  bitrix_user_id text NOT NULL,
  module text NOT NULL CHECK (module IN ('emmely_ai', 'emmely_pay')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (integration_id, bitrix_user_id, module)
);

-- RLS
ALTER TABLE public.bitrix24_user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access bitrix24_user_permissions"
  ON public.bitrix24_user_permissions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Service role full access bitrix24_user_permissions"
  ON public.bitrix24_user_permissions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
