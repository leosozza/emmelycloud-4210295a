

# Plano: Webhook para Atualizar URL do Ollama Remoto

## Contexto

O túnel Cloudflare para o Ollama remoto (Qwen 2.5:32b) muda de URL a cada reinício. Atualmente a URL é atualizada manualmente na Central de Integrações. Vamos criar um webhook público que recebe a nova URL e atualiza automaticamente a credencial `OLLAMA_BASE_URL` na tabela `integration_credentials`.

## Alterações

### 1. Nova Edge Function: `ollama-url-webhook`

- Endpoint público (sem JWT) que aceita POST com `{ "url": "https://nova-url.trycloudflare.com" }`
- Valida que o body contém uma URL válida
- Opcionalmente valida um `secret` no body ou query param para evitar abusos (usará um secret configurável)
- Faz upsert na `integration_credentials` com `provider=ollama`, `credential_key=OLLAMA_BASE_URL`
- Retorna `{ ok: true }` em caso de sucesso

### 2. Configuração

- Adicionar `[functions.ollama-url-webhook] verify_jwt = false` ao config.toml
- O script no servidor local (que inicia o túnel Cloudflare) pode fazer um simples `curl -X POST` com a nova URL após o túnel estar ativo

### Ficheiros

| Ficheiro | Ação |
|----------|------|
| `supabase/functions/ollama-url-webhook/index.ts` | Criar |
| `supabase/config.toml` | Adicionar entrada |

### Exemplo de uso no servidor local

```bash
# Após iniciar o túnel Cloudflare e obter a URL:
curl -X POST "https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/ollama-url-webhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://nova-url.trycloudflare.com", "secret": "MEU_SECRET"}'
```

### Segurança

Um secret partilhado (configurado via variável de ambiente `OLLAMA_WEBHOOK_SECRET`) protege o endpoint contra chamadas não autorizadas. Se não estiver configurado, o webhook funciona sem autenticação (útil para testes iniciais).

