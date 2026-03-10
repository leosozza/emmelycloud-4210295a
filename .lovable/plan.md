

## Add WhatsApp Business API Setup Guide

Add a `WhatsAppApiSetupGuide` component (same pattern as `StripeSetupGuide`) inside the WhatsApp card in the Omni Channel tab.

### File: `src/pages/Integracoes.tsx`

**New component** `WhatsAppApiSetupGuide` (place after `StripeSetupGuide`, before `WhatsAppQRCodeCard`):
- Collapsible with trigger: "Como conectar o WhatsApp Business API?"
- Steps:
  1. **Criar conta Meta Business** — Aceda a business.facebook.com e crie uma conta Business Manager. Link: `https://business.facebook.com/`
  2. **Criar App no Meta Developers** — Vá a developers.facebook.com → My Apps → Create App → Business → selecione a Business Account. Adicione o produto "WhatsApp". Link: `https://developers.facebook.com/apps/`
  3. **Configurar número de telefone** — Em WhatsApp → Getting Started, adicione e verifique um número de telefone comercial. Copie o **Phone Number ID** (campo numérico abaixo do número).
  4. **Gerar Access Token permanente** — Em WhatsApp → Getting Started, gere um token temporário ou crie um System User em Business Settings → System Users com permissão `whatsapp_business_messaging` e gere um token permanente. Copie o token (começa com `EAA...`).
  5. **Configurar Webhook** — Em WhatsApp → Configuration → Webhook, cole o URL do webhook (mostrar URL dinâmico `whatsapp-webhook`) e use o META_APP_SECRET como Verify Token. Subscreva o campo `messages`.

**Integration point**: Add `<WhatsAppApiSetupGuide />` inside the WhatsApp card's `<CardContent>`, after the credential inputs (line ~708).

Also show the webhook URL dynamically (like the Stripe cards do) so the user can copy it for step 5.

