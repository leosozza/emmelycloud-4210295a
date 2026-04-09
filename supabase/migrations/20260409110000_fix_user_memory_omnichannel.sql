-- ─────────────────────────────────────────────────────────────────────────────
-- Migração: Corrigir constraint da user_memory para suporte omnichannel
-- Problema: UNIQUE(contact_phone, key) falha quando o contato chega via
--           Instagram ou Email (contact_phone é NULL), gerando duplicatas.
-- Solução:  Substituir a constraint por uma UNIQUE parcial por canal +
--           adicionar índices de busca por canal.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remover a constraint antiga que só cobre WhatsApp
ALTER TABLE public.user_memory
  DROP CONSTRAINT IF EXISTS user_memory_contact_phone_key_key;

-- 2. Adicionar coluna contact_id unificada (identidade canônica do contato)
--    Será preenchida pelo trigger abaixo para facilitar buscas.
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS contact_id text GENERATED ALWAYS AS (
    COALESCE(contact_phone, contact_instagram, contact_email)
  ) STORED;

-- 3. Adicionar coluna channel para rastrear a origem da memória
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp';

-- 4. Criar constraints UNIQUE parciais por canal (substitui a constraint global)
--    Cada canal tem sua própria constraint, permitindo que o mesmo "key"
--    exista para contatos diferentes em canais diferentes.

-- WhatsApp: UNIQUE(contact_phone, key) quando contact_phone não é NULL
CREATE UNIQUE INDEX IF NOT EXISTS user_memory_phone_key_unique
  ON public.user_memory (contact_phone, key)
  WHERE contact_phone IS NOT NULL;

-- Instagram: UNIQUE(contact_instagram, key) quando contact_instagram não é NULL
CREATE UNIQUE INDEX IF NOT EXISTS user_memory_instagram_key_unique
  ON public.user_memory (contact_instagram, key)
  WHERE contact_instagram IS NOT NULL;

-- Email: UNIQUE(contact_email, key) quando contact_email não é NULL
CREATE UNIQUE INDEX IF NOT EXISTS user_memory_email_key_unique
  ON public.user_memory (contact_email, key)
  WHERE contact_email IS NOT NULL;

-- 5. Índice de busca por contact_id (coluna gerada) para queries rápidas
CREATE INDEX IF NOT EXISTS user_memory_contact_id_idx
  ON public.user_memory (contact_id);

-- 6. Índice de busca por updated_at para limpeza de memória antiga
CREATE INDEX IF NOT EXISTS user_memory_updated_at_idx
  ON public.user_memory (updated_at DESC);

-- 7. Atualizar a coluna channel nos registros existentes
UPDATE public.user_memory
  SET channel = CASE
    WHEN contact_phone IS NOT NULL THEN 'whatsapp'
    WHEN contact_instagram IS NOT NULL THEN 'instagram'
    WHEN contact_email IS NOT NULL THEN 'email'
    ELSE 'whatsapp'
  END
WHERE channel = 'whatsapp' OR channel IS NULL;

-- 8. Adicionar constraint de check: pelo menos um identificador de contato
ALTER TABLE public.user_memory
  DROP CONSTRAINT IF EXISTS user_memory_contact_check;

ALTER TABLE public.user_memory
  ADD CONSTRAINT user_memory_contact_check
  CHECK (
    contact_phone IS NOT NULL OR
    contact_instagram IS NOT NULL OR
    contact_email IS NOT NULL
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Função RPC para upsert seguro de memória omnichannel
-- Evita o problema de ON CONFLICT com índices parciais múltiplos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_user_memory(
  p_contact_phone text,
  p_contact_instagram text,
  p_contact_email text,
  p_channel text,
  p_key text,
  p_value text,
  p_source text DEFAULT 'auto'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_contact_phone IS NOT NULL THEN
    INSERT INTO public.user_memory (contact_phone, contact_instagram, contact_email, channel, key, value, source, updated_at)
    VALUES (p_contact_phone, p_contact_instagram, p_contact_email, p_channel, p_key, p_value, p_source, now())
    ON CONFLICT (contact_phone, key) WHERE contact_phone IS NOT NULL
    DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now();

  ELSIF p_contact_instagram IS NOT NULL THEN
    INSERT INTO public.user_memory (contact_phone, contact_instagram, contact_email, channel, key, value, source, updated_at)
    VALUES (p_contact_phone, p_contact_instagram, p_contact_email, p_channel, p_key, p_value, p_source, now())
    ON CONFLICT (contact_instagram, key) WHERE contact_instagram IS NOT NULL
    DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now();

  ELSIF p_contact_email IS NOT NULL THEN
    INSERT INTO public.user_memory (contact_phone, contact_instagram, contact_email, channel, key, value, source, updated_at)
    VALUES (p_contact_phone, p_contact_instagram, p_contact_email, p_channel, p_key, p_value, p_source, now())
    ON CONFLICT (contact_email, key) WHERE contact_email IS NOT NULL
    DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_user_memory IS
  'Upsert seguro de memória de longo prazo por canal (WhatsApp/Instagram/Email). Usa índices parciais para evitar conflitos entre canais diferentes.';
