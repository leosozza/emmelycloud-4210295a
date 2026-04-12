
-- 1. Add step_details to ai_usage_logs for ReACT audit trail
ALTER TABLE public.ai_usage_logs
ADD COLUMN IF NOT EXISTS step_details JSONB DEFAULT NULL;

-- 2. Create entity_graph table for knowledge graph
CREATE TABLE IF NOT EXISTS public.entity_graph (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast graph traversal
CREATE INDEX IF NOT EXISTS idx_entity_graph_source ON public.entity_graph (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_entity_graph_target ON public.entity_graph (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_entity_graph_relation ON public.entity_graph (relation);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_graph_unique_edge 
  ON public.entity_graph (source_type, source_id, target_type, target_id, relation);

-- Enable RLS
ALTER TABLE public.entity_graph ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read entity_graph"
  ON public.entity_graph FOR SELECT TO authenticated USING (true);

-- 3. Function to populate graph from leads
CREATE OR REPLACE FUNCTION public.populate_graph_from_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Lead -> Client (if client exists via conversation)
  IF NEW.conversation_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('lead', NEW.id::text, 'conversation', NEW.conversation_id::text, 'originated_from', 
            jsonb_build_object('lead_name', NEW.name, 'legal_area', NEW.legal_area))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation) 
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graph_lead
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.populate_graph_from_lead();

-- 4. Function to populate graph from proposals
CREATE OR REPLACE FUNCTION public.populate_graph_from_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Proposal -> Lead
  IF NEW.lead_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('proposal', NEW.id::text, 'lead', NEW.lead_id::text, 'belongs_to_lead',
            jsonb_build_object('title', NEW.title, 'status', NEW.status, 'value', NEW.value))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;

  -- Proposal -> Case
  IF NEW.case_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('proposal', NEW.id::text, 'case', NEW.case_id::text, 'relates_to_case',
            jsonb_build_object('title', NEW.title, 'status', NEW.status))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graph_proposal
AFTER INSERT OR UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.populate_graph_from_proposal();

-- 5. Function to populate graph from contracts
CREATE OR REPLACE FUNCTION public.populate_graph_from_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Contract -> Proposal
  INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
  VALUES ('contract', NEW.id::text, 'proposal', NEW.proposal_id::text, 'contract_for',
          jsonb_build_object('status', NEW.status, 'signed_at', NEW.signed_at))
  ON CONFLICT (source_type, source_id, target_type, target_id, relation)
  DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();

  -- Contract -> Case
  IF NEW.case_id IS NOT NULL THEN
    INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
    VALUES ('contract', NEW.id::text, 'case', NEW.case_id::text, 'contract_for_case',
            jsonb_build_object('status', NEW.status))
    ON CONFLICT (source_type, source_id, target_type, target_id, relation)
    DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graph_contract
AFTER INSERT OR UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.populate_graph_from_contract();

-- 6. Function to populate graph from financial records
CREATE OR REPLACE FUNCTION public.populate_graph_from_financial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Financial -> Contract
  INSERT INTO public.entity_graph (source_type, source_id, target_type, target_id, relation, metadata)
  VALUES ('financial', NEW.id::text, 'contract', NEW.contract_id::text, 'payment_for',
          jsonb_build_object('status', NEW.status, 'total_value', NEW.total_value, 'due_date', NEW.due_date))
  ON CONFLICT (source_type, source_id, target_type, target_id, relation)
  DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graph_financial
AFTER INSERT OR UPDATE ON public.financial_records
FOR EACH ROW EXECUTE FUNCTION public.populate_graph_from_financial();

-- 7. Updated_at trigger for entity_graph
CREATE TRIGGER update_entity_graph_updated_at
BEFORE UPDATE ON public.entity_graph
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
