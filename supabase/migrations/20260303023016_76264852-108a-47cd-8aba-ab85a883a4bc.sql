
-- Table to store report snapshots for public sharing
CREATE TABLE public.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL DEFAULT '{}',
  filters jsonb NOT NULL DEFAULT '{}',
  title text NOT NULL DEFAULT 'Relatório Financeiro',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create snapshots
CREATE POLICY "Authenticated can insert report_snapshots"
  ON public.report_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Anyone can read (public links)
CREATE POLICY "Anyone can read report_snapshots"
  ON public.report_snapshots FOR SELECT
  USING (true);

-- Admins can delete
CREATE POLICY "Admins can delete report_snapshots"
  ON public.report_snapshots FOR DELETE
  TO authenticated
  USING (is_admin());
