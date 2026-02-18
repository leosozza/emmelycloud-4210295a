
-- =============================================
-- AI AGENTS (PERSONAS)
-- =============================================
CREATE TABLE public.ai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL DEFAULT '',
  ai_provider TEXT NOT NULL DEFAULT 'lovable',
  ai_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  ai_base_url TEXT,
  ai_api_key_credential TEXT,
  temperature NUMERIC NOT NULL DEFAULT 0.7,
  avatar_url TEXT,
  welcome_message TEXT,
  fallback_message TEXT DEFAULT 'Desculpe, não consegui processar a sua mensagem. Tente novamente.',
  agent_type TEXT NOT NULL DEFAULT 'text',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  default_flow_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access ai_agents" ON public.ai_agents FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read ai_agents" ON public.ai_agents FOR SELECT USING (true);

CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- KNOWLEDGE DOCUMENTS (Training)
-- =============================================
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  source_type TEXT NOT NULL DEFAULT 'text',
  source_url TEXT,
  file_path TEXT,
  file_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  chunks_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access knowledge_documents" ON public.knowledge_documents FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read knowledge_documents" ON public.knowledge_documents FOR SELECT USING (true);

CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- KNOWLEDGE CHUNKS (Divisão de documentos)
-- =============================================
CREATE TABLE public.knowledge_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  tokens_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access knowledge_chunks" ON public.knowledge_chunks FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read knowledge_chunks" ON public.knowledge_chunks FOR SELECT USING (true);

-- =============================================
-- AGENT ↔ KNOWLEDGE (N:N)
-- =============================================
CREATE TABLE public.agent_knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, document_id)
);

ALTER TABLE public.agent_knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access agent_knowledge_documents" ON public.agent_knowledge_documents FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read agent_knowledge_documents" ON public.agent_knowledge_documents FOR SELECT USING (true);

-- =============================================
-- AGENT TRAINING HISTORY
-- =============================================
CREATE TABLE public.agent_training_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  generated_rule TEXT NOT NULL,
  previous_prompt TEXT,
  applied_at TIMESTAMPTZ DEFAULT now(),
  reverted_at TIMESTAMPTZ,
  trained_by UUID
);

ALTER TABLE public.agent_training_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access agent_training_history" ON public.agent_training_history FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =============================================
-- FLOWS (Editor Visual)
-- =============================================
CREATE TABLE public.flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'keyword',
  trigger_value TEXT,
  keywords TEXT[] DEFAULT '{}',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  variables JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access flows" ON public.flows FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read flows" ON public.flows FOR SELECT USING (true);

CREATE TRIGGER update_flows_updated_at
  BEFORE UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add FK from ai_agents.default_flow_id -> flows.id
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_default_flow_id_fkey
  FOREIGN KEY (default_flow_id) REFERENCES public.flows(id) ON DELETE SET NULL;

-- =============================================
-- FLOW HISTORY (Undo/Redo)
-- =============================================
CREATE TABLE public.flow_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.flow_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access flow_history" ON public.flow_history FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =============================================
-- AI PROVIDERS REGISTRY
-- =============================================
CREATE TABLE public.ai_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  auth_header TEXT DEFAULT 'Authorization',
  auth_prefix TEXT DEFAULT 'Bearer',
  available_models JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_native BOOLEAN NOT NULL DEFAULT false,
  credential_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access ai_providers" ON public.ai_providers FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can read ai_providers" ON public.ai_providers FOR SELECT USING (true);

CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default Lovable AI provider
INSERT INTO public.ai_providers (name, slug, base_url, is_native, available_models) VALUES
('Lovable AI', 'lovable', 'https://ai.gateway.lovable.dev/v1/chat/completions', true, 
 '[{"name":"google/gemini-3-flash-preview","display":"Gemini 3 Flash"},{"name":"google/gemini-2.5-flash","display":"Gemini 2.5 Flash"},{"name":"google/gemini-2.5-pro","display":"Gemini 2.5 Pro"},{"name":"openai/gpt-5","display":"GPT-5"},{"name":"openai/gpt-5-mini","display":"GPT-5 Mini"}]'::jsonb);
