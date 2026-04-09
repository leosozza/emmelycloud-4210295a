CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report           JSONB NOT NULL,
  overall_status   TEXT NOT NULL CHECK (overall_status IN ('healthy', 'degraded', 'critical')),
  errors_count     INTEGER NOT NULL DEFAULT 0,
  warnings_count   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_status_date
  ON public.ai_audit_logs(overall_status, created_at DESC);

ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_audit_logs"
  ON public.ai_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role full access ai_audit_logs"
  ON public.ai_audit_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_audit_logs
  WHERE id NOT IN (
    SELECT id FROM public.ai_audit_logs
    ORDER BY created_at DESC
    LIMIT 100
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_old_audit_logs ON public.ai_audit_logs;
CREATE TRIGGER trg_cleanup_old_audit_logs
  AFTER INSERT ON public.ai_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_old_audit_logs();