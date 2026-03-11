
CREATE TABLE public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text,
  description text,
  conditions text,
  value numeric NOT NULL DEFAULT 0,
  payment_type public.payment_type NOT NULL DEFAULT 'fixo'::public.payment_type,
  installments integer NOT NULL DEFAULT 1,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can access proposal_templates"
  ON public.proposal_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
