-- Evolução 2: Context Ledger entre agentes (inspirado em Continuous-Claude-v3)

-- Ledger: estado consolidado por conversa (1:1)
CREATE TABLE public.conversation_ledger (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  current_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  current_human_id uuid,
  summary text,
  open_intents jsonb NOT NULL DEFAULT '[]'::jsonb,
  collected_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action text,
  message_count_at_summary integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_authenticated_read"
  ON public.conversation_ledger FOR SELECT TO authenticated USING (true);

CREATE POLICY "ledger_admin_write"
  ON public.conversation_ledger FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Handoffs: log append-only de transferências (IA→humano, A→B, etc.)
CREATE TABLE public.conversation_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_actor jsonb NOT NULL,   -- {type:'ai_agent'|'human'|'system', id, name}
  to_actor jsonb NOT NULL,
  reason text,
  snapshot jsonb,              -- snapshot do ledger no momento do handoff
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_handoffs_conv ON public.conversation_handoffs(conversation_id, created_at DESC);

ALTER TABLE public.conversation_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handoffs_authenticated_read"
  ON public.conversation_handoffs FOR SELECT TO authenticated USING (true);

CREATE POLICY "handoffs_authenticated_insert"
  ON public.conversation_handoffs FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger updated_at no ledger
CREATE TRIGGER trg_ledger_updated_at
  BEFORE UPDATE ON public.conversation_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();