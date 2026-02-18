
-- Add unique constraint for upsert in bitrix24_channel_mappings
ALTER TABLE public.bitrix24_channel_mappings 
ADD CONSTRAINT bitrix24_channel_mappings_integration_channel_line_unique 
UNIQUE (integration_id, channel, line_id);
