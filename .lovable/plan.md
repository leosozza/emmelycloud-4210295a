
# Problema: Tabela `chatbot_channel_settings` em falta na base de dados

## Diagnóstico

A migração SQL que cria a tabela `chatbot_channel_settings` existe no projeto (`supabase/migrations/20260219200001_chatbot_channel_settings.sql`) mas **nunca foi executada na base de dados**. O PostgREST desconhece a tabela e lança o erro:

> `Could not find the table 'public.chatbot_channel_settings' in the schema cache`

A UI em `/integracoes` → aba "Chatbot" já está completa e funcional — só falta a tabela existir na base de dados.

## Solução

### 1. Criar a tabela via migração

Executar o SQL que cria a tabela, as policies RLS e as linhas iniciais para WhatsApp e Instagram:

```sql
CREATE TABLE IF NOT EXISTS public.chatbot_channel_settings (
  channel    TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  agent_id   UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.chatbot_channel_settings (channel, enabled)
VALUES ('whatsapp', false), ('instagram', false)
ON CONFLICT (channel) DO NOTHING;

ALTER TABLE public.chatbot_channel_settings ENABLE ROW LEVEL SECURITY;

-- Admins gerem tudo
CREATE POLICY "Admins full access chatbot_channel_settings"
  ON public.chatbot_channel_settings
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Utilizadores autenticados podem ler
CREATE POLICY "Authenticated can read chatbot_channel_settings"
  ON public.chatbot_channel_settings
  FOR SELECT
  USING (true);

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
```

### 2. Corrigir a policy RLS (melhoria de segurança)

A migração original usava `auth.role() = 'authenticated'` sem `WITH CHECK`, o que permitiria a qualquer utilizador autenticado alterar as configurações do chatbot. A nova migração alinha com o padrão do projeto: apenas admins escrevem, todos os autenticados leem.

### 3. Verificar integração com chatbot-reply

Depois da tabela existir, verificar se a edge function `chatbot-reply` (ou `ai-process-message`) lê `chatbot_channel_settings` para saber se deve responder num determinado canal — caso contrário, ligar essa lógica.

## Ficheiros a alterar

- **Nova migração SQL** (base de dados): cria a tabela, seeds e policies RLS corretas
- Nenhum ficheiro TypeScript precisa de ser alterado — o código da `ChatbotTab` já está correto

## O que NÃO muda

- A UI em `Integracoes.tsx` já está perfeita e não precisa de alterações
- O upsert com `onConflict: "channel"` já funciona corretamente uma vez que a tabela exista
