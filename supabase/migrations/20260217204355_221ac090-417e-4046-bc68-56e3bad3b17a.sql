
-- Add delivery_status column to messages table
ALTER TABLE public.messages 
ADD COLUMN delivery_status text DEFAULT 'sent';

-- Add index for faster lookups on external_id (used to poll Callbell)
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON public.messages(external_id) WHERE external_id IS NOT NULL;
