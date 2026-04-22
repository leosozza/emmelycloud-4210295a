
## Objetivo

Criar e preencher automaticamente um campo no Bitrix24 chamado **TOKEN_PAY**, para que sempre que o sistema gerar ou reutilizar um link de relatório de pagamento, o token separado também fique gravado no negócio.

Assim o template pode continuar usando:

```text
RELATORIO PAY ✅

https://emmelycloud.pages.dev/pagamento/
```

e enviar o valor dinâmico do campo **TOKEN_PAY** como parâmetro:

```text
ac511cda-8f50-4ba3-aca6-6ac97a2fd3b4
```

## O que será alterado

### 1. Criar campo Bitrix24 `TOKEN_PAY`

Adicionar o campo ao instalador/configurador do app Bitrix24:

- Campo interno: `UF_CRM_EMMELY_TOKEN_PAY`
- Nome visível: `TOKEN_PAY`
- Tipo: texto/string
- Uso: guardar apenas o token, sem URL

Exemplo de valor salvo:

```text
ac511cda-8f50-4ba3-aca6-6ac97a2fd3b4
```

### 2. Atualizar geração do Relatório Pay

Nas rotinas que criam ou reutilizam `receipt_links`, quando o token for obtido, atualizar o negócio no Bitrix24 com:

```ts
{
  UF_CRM_EMMELY_RELATORIO_PAY: "https://emmelycloud.pages.dev/pagamento/{token}",
  UF_CRM_EMMELY_TOKEN_PAY: "{token}"
}
```

Isso será aplicado principalmente em:

- `supabase/functions/bitrix24-robot-handler/index.ts`
  - fluxo de robot/template que gera o relatório de pagamento
- `supabase/functions/bitrix24-payment-tab/index.ts`
  - geração manual/cópia do link dentro do placement Emmely Pay
- `supabase/functions/payment-create/index.ts`
  - criação automática de comprovante/link após baixa/pagamento

### 3. Manter compatibilidade com campos atuais

Não remover nem mudar os campos existentes:

- `UF_CRM_EMMELY_RELATORIO_PAY`
- `UF_CRM_EMMELY_RECEIPT_URL`

O novo campo será complementar, para templates que precisam montar a URL base + parâmetro separado.

### 4. Garantir criação idempotente

Antes de salvar o token, o sistema tentará garantir que o campo existe no Bitrix24.

Se o campo já existir, ignora o erro e continua.

### 5. Resultado esperado

Sempre que for criado/reutilizado um link como:

```text
https://emmelycloud.pages.dev/pagamento/ac511cda-8f50-4ba3-aca6-6ac97a2fd3b4
```

o Bitrix24 ficará com:

```text
RELATÓRIO DE PAGAMENTOS = https://emmelycloud.pages.dev/pagamento/ac511cda-8f50-4ba3-aca6-6ac97a2fd3b4
TOKEN_PAY = ac511cda-8f50-4ba3-aca6-6ac97a2fd3b4
```

## Verificação

Depois da implementação:

1. Gerar um novo Relatório Pay.
2. Abrir o negócio no Bitrix24.
3. Confirmar que o campo **TOKEN_PAY** foi preenchido.
4. Enviar pelo template usando:
   - URL fixa: `https://emmelycloud.pages.dev/pagamento/`
   - parâmetro dinâmico: `TOKEN_PAY`
5. Confirmar que o cliente abre corretamente a página `/pagamento/{token}`.
