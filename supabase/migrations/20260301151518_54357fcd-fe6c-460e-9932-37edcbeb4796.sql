
CREATE TABLE public.ollama_url_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_ip TEXT,
  received_url TEXT,
  previous_url TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  secret_valid BOOLEAN DEFAULT true,
  raw_payload JSONB
);

ALTER TABLE public.ollama_url_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON public.ollama_url_audit
  FOR ALL USING (true) WITH CHECK (true);
