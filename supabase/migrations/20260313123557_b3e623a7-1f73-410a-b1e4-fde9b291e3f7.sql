
-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Add embedding column to knowledge_chunks
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3. Create index for vector similarity search
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON public.knowledge_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. Create match_chunks function for semantic search
CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 5. Create ai_usage_logs table (observability)
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  model text,
  provider text,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  total_tokens int DEFAULT 0,
  latency_ms int DEFAULT 0,
  cost_estimate numeric DEFAULT 0,
  was_fallback boolean DEFAULT false,
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_usage_logs" ON public.ai_usage_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Service role full access ai_usage_logs" ON public.ai_usage_logs
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. Create conversation_feedback table
CREATE TABLE public.conversation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  rating smallint CHECK (rating >= -1 AND rating <= 1),
  issue_type text,
  comment text,
  created_by uuid,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage conversation_feedback" ON public.conversation_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Create user_memory table (long-term memory)
CREATE TABLE public.user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_phone text,
  contact_instagram text,
  contact_email text,
  key text NOT NULL,
  value text NOT NULL,
  source text DEFAULT 'auto',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(contact_phone, key) 
);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read user_memory" ON public.user_memory
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Service role full access user_memory" ON public.user_memory
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 8. Create message_queue table
CREATE TABLE public.message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  message_text text NOT NULL,
  message_type text DEFAULT 'text',
  interactive_response jsonb,
  instance_id text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'grouped')),
  priority int DEFAULT 5,
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3,
  last_error text,
  created_at timestamptz DEFAULT now(),
  processing_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access message_queue" ON public.message_queue
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Admins can read message_queue" ON public.message_queue
  FOR SELECT TO authenticated USING (public.is_admin());

-- 9. Create agent_tools table (tool calling)
CREATE TABLE public.agent_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE NOT NULL,
  tool_name text NOT NULL,
  tool_description text,
  tool_parameters jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, tool_name)
);

ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access agent_tools" ON public.agent_tools
  FOR ALL TO public USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can read agent_tools" ON public.agent_tools
  FOR SELECT TO public USING (true);
