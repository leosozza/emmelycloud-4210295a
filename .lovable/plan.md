# Testar webhook do Gupshup antes de ativar

Adicionar um botão "Testar webhook" no card Gupshup em `/integracoes` que valida conectividade e assinatura HMAC SHA-256 antes da ativação.

## UX no card Gupshup (`src/pages/Integracoes.tsx`)

Logo abaixo do campo `GUPSHUP_WEBHOOK_SECRET` e da URL do webhook, adicionar:

- Botão **"Testar webhook"** (variant outline). Desativado se faltar `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME` ou `GUPSHUP_SOURCE_NUMBER`.
- Bloco de resultado expansível com 3 checks em formato de checklist:
  1. **Endpoint acessível** — GET ao webhook retorna 200 OK
  2. **Assinatura HMAC válida** — POST simulado com header `x-gupshup-signature` assinado com o secret salvo é aceito (200); POST com assinatura inválida é rejeitado (401). Se nenhum secret configurado: aviso amarelo "Webhook desprotegido — recomendado configurar `GUPSHUP_WEBHOOK_SECRET`".
  3. **Persistência** — confirma que o evento de teste foi gravado em `messages` (lookup por `external_id` único do teste) e depois removido.
- Cada item mostra status (ok/warn/fail) + mensagem curta + detalhe técnico em `<details>`.
- Botão **"Ativar Gupshup"** existente só fica habilitado depois do teste passar (ou usuário clicar "Ativar mesmo assim" caso queira ignorar warn de secret ausente).

## Backend: nova edge function `gupshup-webhook-test`

`supabase/functions/gupshup-webhook-test/index.ts` — invocada pelo botão via `supabase.functions.invoke`.

Fluxo:
1. Lê `GUPSHUP_WEBHOOK_SECRET` de `integration_credentials`.
2. Faz `GET` ao próprio `gupshup-webhook` → registra check #1.
3. Monta payload sintético tipo `message` Gupshup com `external_id = "test-<uuid>"`, assina com HMAC SHA-256 do secret e faz `POST` ao `gupshup-webhook` com header `x-gupshup-signature: sha256=<hex>` → espera 200.
4. Se secret existe: refaz `POST` com assinatura inválida → espera 401 (confirma rejeição).
5. Aguarda ~500ms e busca em `messages` por `external_id` para confirmar persistência; em seguida apaga o registro (service role).
6. Retorna JSON `{ checks: [{ id, status, message, detail }] }`.

Config: deploy padrão com `verify_jwt = true` (chamada autenticada do app).

## Pequeno ajuste em `gupshup-webhook`

Marcar mensagens de teste para não disparar fluxos/IA: se `payload.payload?.context?.test === true`, salva em `messages` e retorna 200 sem invocar `ai-automation-agent` / `flow-engine`. Mantém todo o caminho de validação HMAC real.

## Arquivos

- novo: `supabase/functions/gupshup-webhook-test/index.ts`
- editar: `supabase/functions/gupshup-webhook/index.ts` (early-return em payload de teste)
- editar: `src/pages/Integracoes.tsx` (botão + bloco de resultado + gating do "Ativar")

Sem migrações de DB.
