-- Add contact_lid column to store WhatsApp Linked ID (anonymous identifier from WUZAPI v2+)
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS contact_lid TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_contact_lid 
  ON public.conversations (contact_lid) 
  WHERE contact_lid IS NOT NULL;

-- Backfill: move @lid values from contact_phone to contact_lid
-- These conversations had the LID stored as phone, breaking Bitrix24 contact/deal matching
UPDATE public.conversations
SET 
  contact_lid = contact_phone,
  contact_phone = NULL
WHERE contact_phone LIKE '%@lid'
  AND contact_lid IS NULL;