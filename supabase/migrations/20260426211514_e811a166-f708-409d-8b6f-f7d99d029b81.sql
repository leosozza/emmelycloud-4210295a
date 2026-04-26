-- 1) Consolidate duplicate conversations (same contact_phone + channel)
DO $$
DECLARE
  r record;
  v_keep uuid;
  v_drop uuid[];
BEGIN
  FOR r IN
    SELECT contact_phone, channel
    FROM public.conversations
    WHERE contact_phone IS NOT NULL AND contact_phone <> ''
    GROUP BY contact_phone, channel
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO v_keep
    FROM public.conversations
    WHERE contact_phone = r.contact_phone AND channel = r.channel
    ORDER BY COALESCE(last_message_at, created_at) DESC NULLS LAST, created_at DESC
    LIMIT 1;

    SELECT array_agg(id) INTO v_drop
    FROM public.conversations
    WHERE contact_phone = r.contact_phone AND channel = r.channel AND id <> v_keep;

    UPDATE public.messages
    SET conversation_id = v_keep
    WHERE conversation_id = ANY(v_drop);

    DELETE FROM public.conversations WHERE id = ANY(v_drop);
  END LOOP;
END $$;

-- 2) Partial unique index: only one OPEN conversation per (phone, channel)
DROP INDEX IF EXISTS public.uniq_active_conversation_phone_channel;
CREATE UNIQUE INDEX uniq_active_conversation_phone_channel
ON public.conversations (contact_phone, channel)
WHERE contact_phone IS NOT NULL
  AND contact_phone <> ''
  AND status <> 'fechada';