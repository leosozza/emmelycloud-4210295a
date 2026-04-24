-- Tabela para armazenar resultados de benchmark dos modelos Ollama
CREATE TABLE IF NOT EXISTS public.ollama_model_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug TEXT NOT NULL DEFAULT 'qwen-local',
  model_name TEXT NOT NULL,
  quality_score NUMERIC(5,2),
  reasoning_score NUMERIC(5,2),
  knowledge_score NUMERIC(5,2),
  instruction_score NUMERIC(5,2),
  avg_latency_ms INTEGER,
  tokens_per_second NUMERIC(10,2),
  recommendation TEXT,
  raw_results JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_slug, model_name)
);

CREATE INDEX IF NOT EXISTS idx_ollama_benchmarks_provider ON public.ollama_model_benchmarks(provider_slug);
CREATE INDEX IF NOT EXISTS idx_ollama_benchmarks_quality ON public.ollama_model_benchmarks(quality_score DESC NULLS LAST);

ALTER TABLE public.ollama_model_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access ollama_model_benchmarks"
ON public.ollama_model_benchmarks
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Authenticated can read ollama_model_benchmarks"
ON public.ollama_model_benchmarks
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role full access ollama_model_benchmarks"
ON public.ollama_model_benchmarks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_ollama_model_benchmarks_updated_at
BEFORE UPDATE ON public.ollama_model_benchmarks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();