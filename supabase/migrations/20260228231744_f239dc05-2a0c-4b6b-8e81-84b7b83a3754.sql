ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS collection_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS collection_name TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_collection_id ON public.knowledge_documents(collection_id) WHERE collection_id IS NOT NULL;