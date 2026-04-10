-- Add flow automation columns to proposals
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS signed_flow_id text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS paid_flow_id text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS overdue_flow_id text;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS overdue_days integer DEFAULT 0;

-- Add flow automation columns to payment_transactions
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS paid_flow_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS overdue_flow_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS overdue_days integer DEFAULT 0;