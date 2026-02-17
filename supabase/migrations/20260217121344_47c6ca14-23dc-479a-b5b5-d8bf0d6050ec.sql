ALTER TABLE public.leads ADD COLUMN conversation_id uuid REFERENCES public.conversations(id);

-- Add permissive RLS policy for the new column (already covered by existing permissive policies on leads)
