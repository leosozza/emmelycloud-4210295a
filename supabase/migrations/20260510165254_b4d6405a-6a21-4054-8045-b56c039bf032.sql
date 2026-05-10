
CREATE TABLE public.spa_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  deal_id text NOT NULL,
  spa_item_id text,
  source_category_id integer NOT NULL,
  target_entity_type_id integer NOT NULL,
  source_stage_id text,
  target_stage_id text,
  deal_title text,
  status text NOT NULL CHECK (status IN ('success','failed','skipped','preview')),
  error_message text,
  mode text NOT NULL CHECK (mode IN ('dry_run','execute')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_spa_migration_session ON public.spa_migration_log(session_id);
CREATE INDEX idx_spa_migration_deal ON public.spa_migration_log(deal_id);
CREATE INDEX idx_spa_migration_status ON public.spa_migration_log(status);

ALTER TABLE public.spa_migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage spa migration log"
ON public.spa_migration_log
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
