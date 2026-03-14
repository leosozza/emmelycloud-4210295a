
-- Add accepted_ip and accepted_user_agent columns for legal evidence
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS accepted_ip text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS accepted_user_agent text;

-- Add 'expirada' to proposal_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expirada' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'proposal_status')) THEN
    ALTER TYPE public.proposal_status ADD VALUE 'expirada';
  END IF;
END$$;
