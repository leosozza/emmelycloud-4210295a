ALTER TABLE public.bitrix24_channel_mappings 
ADD COLUMN IF NOT EXISTS connector_id text DEFAULT 'emmely_connector';