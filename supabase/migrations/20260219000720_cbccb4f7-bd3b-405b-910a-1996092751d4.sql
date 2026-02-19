
-- 1. Add provider_type to ai_providers
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'text';

-- 2. Add voice columns to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_provider text DEFAULT NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_model text DEFAULT NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_id text DEFAULT NULL;

-- 3. Update existing Lovable AI provider type
UPDATE public.ai_providers SET provider_type = 'text' WHERE slug = 'lovable';

-- 4. Insert Text/Chat providers
INSERT INTO public.ai_providers (name, slug, base_url, is_native, is_active, credential_key, provider_type, auth_header, auth_prefix, available_models) VALUES
(
  'OpenAI', 'openai', 'https://api.openai.com/v1/chat/completions', false, true, 'api_key', 'text', 'Authorization', 'Bearer',
  '[{"name":"gpt-4o","display":"GPT-4o"},{"name":"gpt-4o-mini","display":"GPT-4o Mini"},{"name":"gpt-4-turbo","display":"GPT-4 Turbo"},{"name":"o1","display":"o1"},{"name":"o1-mini","display":"o1 Mini"}]'::jsonb
),
(
  'DeepSeek', 'deepseek', 'https://api.deepseek.com/v1/chat/completions', false, true, 'api_key', 'text', 'Authorization', 'Bearer',
  '[{"name":"deepseek-chat","display":"DeepSeek Chat"},{"name":"deepseek-reasoner","display":"DeepSeek Reasoner"}]'::jsonb
),
(
  'Groq', 'groq', 'https://api.groq.com/openai/v1/chat/completions', false, true, 'api_key', 'text', 'Authorization', 'Bearer',
  '[{"name":"llama-3.3-70b-versatile","display":"LLaMA 3.3 70B"},{"name":"mixtral-8x7b-32768","display":"Mixtral 8x7B"},{"name":"gemma2-9b-it","display":"Gemma 2 9B"}]'::jsonb
),
(
  'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', false, true, 'api_key', 'text', 'x-goog-api-key', '',
  '[{"name":"gemini-2.5-pro","display":"Gemini 2.5 Pro"},{"name":"gemini-2.5-flash","display":"Gemini 2.5 Flash"},{"name":"gemini-2.0-flash","display":"Gemini 2.0 Flash"}]'::jsonb
),
(
  'Qwen Local', 'qwen-local', 'http://localhost:11434/v1/chat/completions', false, true, NULL, 'text', NULL, NULL,
  '[{"name":"qwen2.5:7b","display":"Qwen 2.5 7B"},{"name":"qwen2.5:14b","display":"Qwen 2.5 14B"},{"name":"qwen2.5:32b","display":"Qwen 2.5 32B"}]'::jsonb
);

-- 5. Insert Voice providers
INSERT INTO public.ai_providers (name, slug, base_url, is_native, is_active, credential_key, provider_type, auth_header, auth_prefix, available_models) VALUES
(
  'ElevenLabs', 'elevenlabs', 'https://api.elevenlabs.io/v1', false, true, 'api_key', 'voice', 'xi-api-key', '',
  '[{"name":"eleven_multilingual_v2","display":"Multilingual v2"},{"name":"eleven_turbo_v2_5","display":"Turbo v2.5"},{"name":"eleven_monolingual_v1","display":"Monolingual v1"}]'::jsonb
),
(
  'OpenAI TTS', 'openai-tts', 'https://api.openai.com/v1/audio', false, true, 'api_key', 'voice', 'Authorization', 'Bearer',
  '[{"name":"tts-1","display":"TTS-1"},{"name":"tts-1-hd","display":"TTS-1 HD"},{"name":"whisper-1","display":"Whisper (STT)"}]'::jsonb
);
