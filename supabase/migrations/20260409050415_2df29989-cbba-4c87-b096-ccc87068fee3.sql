-- Remover a constraint antiga que só suportava contact_phone
ALTER TABLE public.user_memory
  DROP CONSTRAINT IF EXISTS user_memory_contact_phone_key_key;

-- Garantir que a coluna id existe como PK
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_memory' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE public.user_memory ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Adicionar colunas de canal se não existirem
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS contact_instagram TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_email     TEXT DEFAULT NULL;

-- Índices parciais por canal
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_phone_key
  ON public.user_memory(contact_phone, key)
  WHERE contact_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_instagram_key
  ON public.user_memory(contact_instagram, key)
  WHERE contact_instagram IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_email_key
  ON public.user_memory(contact_email, key)
  WHERE contact_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_memory_phone
  ON public.user_memory(contact_phone)
  WHERE contact_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_memory_instagram
  ON public.user_memory(contact_instagram)
  WHERE contact_instagram IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_memory_email
  ON public.user_memory(contact_email)
  WHERE contact_email IS NOT NULL;

-- Função RPC atômica para upsert de memória omnichannel
CREATE OR REPLACE FUNCTION public.upsert_user_memory(
  p_channel          TEXT,
  p_contact_id       TEXT,
  p_key              TEXT,
  p_value            TEXT,
  p_confidence       FLOAT DEFAULT 1.0,
  p_source           TEXT DEFAULT 'ai_extraction'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_col TEXT;
BEGIN
  v_col := CASE p_channel
    WHEN 'whatsapp'   THEN 'contact_phone'
    WHEN 'phone'      THEN 'contact_phone'
    WHEN 'instagram'  THEN 'contact_instagram'
    WHEN 'email'      THEN 'contact_email'
    ELSE 'contact_phone'
  END;

  IF v_col = 'contact_phone' THEN
    INSERT INTO public.user_memory (contact_phone, key, value, confidence, source, updated_at)
    VALUES (p_contact_id, p_key, p_value, p_confidence, p_source, now())
    ON CONFLICT (contact_phone, key) WHERE contact_phone IS NOT NULL
    DO UPDATE SET
      value      = EXCLUDED.value,
      confidence = EXCLUDED.confidence,
      source     = EXCLUDED.source,
      updated_at = now()
    RETURNING id INTO v_id;

  ELSIF v_col = 'contact_instagram' THEN
    INSERT INTO public.user_memory (contact_instagram, key, value, confidence, source, updated_at)
    VALUES (p_contact_id, p_key, p_value, p_confidence, p_source, now())
    ON CONFLICT (contact_instagram, key) WHERE contact_instagram IS NOT NULL
    DO UPDATE SET
      value      = EXCLUDED.value,
      confidence = EXCLUDED.confidence,
      source     = EXCLUDED.source,
      updated_at = now()
    RETURNING id INTO v_id;

  ELSIF v_col = 'contact_email' THEN
    INSERT INTO public.user_memory (contact_email, key, value, confidence, source, updated_at)
    VALUES (p_contact_id, p_key, p_value, p_confidence, p_source, now())
    ON CONFLICT (contact_email, key) WHERE contact_email IS NOT NULL
    DO UPDATE SET
      value      = EXCLUDED.value,
      confidence = EXCLUDED.confidence,
      source     = EXCLUDED.source,
      updated_at = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;