GRANT SELECT, INSERT, UPDATE, DELETE ON public.flows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flows TO authenticated;
GRANT ALL ON public.flows TO service_role;

DROP POLICY IF EXISTS "Admins full access flows" ON public.flows;
DROP POLICY IF EXISTS "Authenticated can read flows" ON public.flows;
DROP POLICY IF EXISTS "App full access flows" ON public.flows;

CREATE POLICY "App full access flows"
  ON public.flows
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);