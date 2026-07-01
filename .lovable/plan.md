## Objetivo

Corrigir dois problemas do modal "Criar Cobrança" dentro do iframe do Bitrix (Emmely Pay):

1. O cartão do formulário fica pequeno (largura 440px / altura 85vh) — difícil escrever dentro do iframe do Bitrix.
2. Faltam campos obrigatórios de cliente exigidos pelos gateways (Asaas e Stripe), o que faz a cobrança falhar ao chegar no `payment-create`.

Escopo: apenas UI + payload do modal em `supabase/functions/bitrix24-payment-tab/index.ts`. Sem mudanças de backend, migrations ou outros arquivos.

## Mudanças

### 1) Aumentar a área do modal

Em `.b24-form-card` (linha ~502):
- `width: 640px` (era 440px)
- `max-width: 96vw`
- `max-height: 92vh`
- `padding: 20px 24px`
- Inputs com `min-height: 36px` e `font-size: 13px` para digitação confortável.
- Overlay com `padding: 12px` para não colar nas bordas do iframe.
- `BX24.resizeWindow()` / `fitWindow()` chamado ao abrir o modal para o Bitrix expandir o iframe.

### 2) Campos obrigatórios de cliente (bloco "Dados do Cliente")

Novo bloco colapsável no modal, pré-preenchido com dados do contato/empresa do Bitrix (já disponíveis em `contactName`, `contactEmail`, `contactCpfCnpj`, mais os que vamos ler agora):

| Campo | Obrigatoriedade | Origem no Bitrix |
|---|---|---|
| Nome | sempre | contact.NAME + LAST_NAME |
| Email | sempre | contact.EMAIL[0] |
| Telefone | Asaas (recomendado) / Stripe boleto | contact.PHONE[0] |
| CPF/CNPJ / NIF | Asaas sempre; Stripe BRL | UF_CRM_CPF/CNPJ/NIF |
| CEP / Código Postal | Asaas boleto+NF, Stripe boleto | contact.ADDRESS_POSTAL_CODE |
| Endereço (rua) | Asaas boleto+NF | contact.ADDRESS |
| Número | Asaas boleto+NF | contact.ADDRESS_2 (fallback) |
| Bairro | Asaas boleto | contact.ADDRESS_CITY (aprox) |
| Cidade | Asaas / Stripe boleto | contact.ADDRESS_CITY |
| Estado (UF) | Asaas | contact.ADDRESS_PROVINCE |
| País | Stripe | contact.ADDRESS_COUNTRY, default PT/BR pela moeda |

Validação client-side antes de `submitInstallments()`:
- Sempre: nome, email.
- BRL ou método `boleto`/`pix`: CPF/CNPJ.
- Método `boleto` (Asaas ou Stripe BR): CEP, endereço, número, cidade, estado.
- Cada campo faltante destaca o input e mostra mensagem em `#pay-result` (sem enviar).

Os campos são enviados ao `payment-create` num objeto `customer` já normalizado:

```ts
customer: {
  name, email, phone, cpfCnpj,
  address: { postal_code, street, number, district, city, state, country }
}
```

`payment-create` já aceita esses campos hoje (via `_shared/asaas-client.ts` `ensureCustomer` e no path Stripe via `billing_details`) — nenhum ajuste necessário no backend, só passar o payload completo em vez de só `nome/email/cpf`.

### 3) UX

- Bloco "Dados do Cliente" abre expandido se algum obrigatório estiver vazio; caso contrário, colapsado com resumo ("João Silva · joao@x.com · CPF ok").
- Toggle mostra/oculta campos de endereço automaticamente quando método = `boleto`.
- Mantém o comportamento atual de esconder o CPF quando moeda = EUR e método ≠ boleto/pix.

## Arquivos a editar

- `supabase/functions/bitrix24-payment-tab/index.ts` (CSS do card, HTML do modal, leitura de campos do contato Bitrix já existente em ~L2380, função `submitInstallments()` para validar e montar `customer`).

## Fora de escopo

- Nada de novas migrations, secrets, ou mudanças no `payment-create` / `_shared/asaas-client.ts`.
- Nada de mudança nos robots Bizproc, `FieldMappingManager`, ou outros placements.
