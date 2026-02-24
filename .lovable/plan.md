

# Plano: Guia Passo-a-Passo Stripe na aba Pagamentos

## Objetivo

Adicionar ao card do Stripe na pagina `/integracoes` (aba Pagamentos) um guia visual de configuracao e o URL do webhook, seguindo o mesmo padrao ja usado no card do Asaas.

## Alteracoes

### Ficheiro: `src/pages/Integracoes.tsx`

Dentro do card Stripe (componente `PagamentosTab`, por volta da linha 702-721), adicionar:

**1. Webhook URL com botao de copiar**

Usar o componente `WebhookUrlDisplay` ja existente:
```
URL: https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-webhook-stripe
Eventos: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded
```

**2. Guia passo-a-passo (Accordion ou lista numerada)**

Secao colapsavel "Como configurar" com os seguintes passos:

1. Aceda ao Stripe Dashboard em dashboard.stripe.com
2. Va a Developers > API Keys
3. Copie a Secret Key (sk_live_... ou sk_test_...) e cole acima
4. Va a Developers > Webhooks > Add endpoint
5. Cole o Webhook URL acima como Endpoint URL
6. Selecione os eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`
7. Apos criar o endpoint, copie o Signing Secret (whsec_...) e cole acima
8. Clique em "Testar Conexao" para validar

**3. Implementacao tecnica**

- Usar o componente `Collapsible` (ja importado no projeto via radix) ou um simples `details/summary` estilizado com Tailwind
- Cada passo tera um numero, titulo curto e texto descritivo
- Links externos abrem em nova aba (`target="_blank"`)
- Manter o mesmo estilo visual do card Asaas (compacto, text-xs/text-sm)

### Resumo de impacto

- Apenas alteracoes no ficheiro `src/pages/Integracoes.tsx`
- Adiciona ~40 linhas ao card Stripe existente
- Sem alteracoes no backend
- Reutiliza o componente `WebhookUrlDisplay` ja existente

