## Objetivo

Separar o robot Emmely WhatsApp em **dois** para eliminar o ruído dos campos irrelevantes e evitar erros como "Message Sending failed as template did not match":

- **`emmely_send_whatsapp`** → apenas texto/mídia/botões/lista/link (sem template).
- **`emmely_send_whatsapp_template`** → apenas envio de template HSM aprovado (Meta/Gupshup).

## Mudanças

### 1. `supabase/functions/bitrix24-install/index.ts`

Há duas listas de robots que precisam ser sincronizadas (bloco `repairRobots` ~linha 826 e bloco `robots` inicial ~linha 2012). Em **ambas**:

**a) Enxugar `emmely_send_whatsapp`:**
- Remover propriedades: `template_name`, `template_language`, `template_params`.
- No `message_type`, remover a opção `template` das `Options`.
- Manter todo o resto (texto/mídia/botões/lista/link).

**b) Adicionar novo robot `emmely_send_whatsapp_template`:**
```ts
{
  CODE: "emmely_send_whatsapp_template",
  NAME: "Emmely: Enviar WhatsApp Template",
  PROPERTIES: {
    phone: { Name: "Telefone", Type: "string", Required: "Y",
             Description: "Número com código do país. Ex: +351912345678" },
    template_name: { Name: "Nome do Template", Type: "string", Required: "Y",
             Description: "Nome exato do template aprovado no Meta/Gupshup (ex: linkemmely)" },
    template_language: { Name: "Idioma do Template", Type: "string",
             Required: "N", Default: "pt_BR",
             Description: "Código do idioma aprovado. Ex: pt_BR, pt_PT, en_US" },
    template_params: { Name: "Parâmetros ({{1}},{{2}},...)", Type: "text",
             Required: "N",
             Description: "Valores separados por | na ordem das variáveis. Ex: João|1234|10€" },
  },
  RETURN_PROPERTIES: {
    message_id: { Name: "ID da Mensagem", Type: "string" },
    status: { Name: "Status", Type: "string" },
    error: { Name: "Erro", Type: "string" },
  },
}
```

### 2. `supabase/functions/bitrix24-robot-handler/index.ts`

No `switch (code)` (linha 2451), adicionar case novo antes do `emmely_send_instagram`:

```ts
case "emmely_send_whatsapp_template": {
  // Force template mode and delegate to the existing WhatsApp handler.
  const templateProps = {
    phone: properties.phone,
    message_type: "template",
    template_name: properties.template_name,
    template_language: properties.template_language,
    template_params: properties.template_params,
  };
  returnValues = await handleSendWhatsApp(templateProps, supabaseUrl, serviceKey, timelineCtx);
  break;
}
```

`handleSendWhatsApp` já lida corretamente com `message_type: "template"` — nada mais muda ali.

### 3. Documentação

Atualizar `src/pages/ApiDocs.tsx` na seção dos robots para citar o novo `emmely_send_whatsapp_template` (apenas menção; o painel real vem do próprio Bitrix). Se não houver tabela explícita de robots, ignorar.

## Fora de escopo

- Não alterar `handleSendWhatsApp` — a lógica de template continua igual.
- Não corrigir o template `linkemmely` em si (falha "did not match" é problema de payload/número de parâmetros do template aprovado; será tratado depois com base nos logs do Gupshup que já estão sendo capturados).
- Nenhuma migration de banco.

## Passo pós-deploy

Para que o Bitrix veja o novo robot, o usuário precisa disparar **"Reparar robots"** no Configurações → Integrações → Bitrix24 (ou reconectar). O bloco `repairRobots` faz `bizproc.robot.delete` + `bizproc.robot.add` para cada CODE, então basta rodar.

## Validação

1. Após reparar, no BizProc do deal aparecem dois robots: "Emmely: Enviar WhatsApp" (sem campos de template) e "Emmely: Enviar WhatsApp Template" (só 4 campos).
2. Testar o robot template com `template_name=linkemmely` + params corretos → timeline mostra "⏳ enviado ao provedor" e atualiza para ✅/❌.
