## Resumo
Adicionar uma segunda variante do botão de microfone com `context: "ALL"` no placement `IM_TEXTAREA`, mantendo a variante existente em `LINES`. Assim o operador vê o ícone em qualquer chat (não só Open Channels).

## Mudanças

### 1. `supabase/functions/bitrix24-rebind-events/index.ts`
Logo após o bloco atual de "Send Audio (WhatsApp) — LINES", acrescentar um novo bloco que registra o mesmo handler com sufixo `?ctx=all` para que o Bitrix24 aceite o segundo bind (a chave única é `PLACEMENT + HANDLER`):

```ts
// IM_TEXTAREA — Send Audio (WhatsApp) — ALL context variant
const sendAudioAllUrl = `${supabaseUrl}/functions/v1/bitrix24-im-send-audio?ctx=all`;
await callBitrix(... "placement.unbind", { PLACEMENT: "IM_TEXTAREA", HANDLER: sendAudioAllUrl });
const r = await callBitrix(... "placement.bind", {
  PLACEMENT: "IM_TEXTAREA",
  HANDLER: sendAudioAllUrl,
  TITLE: "Áudio WhatsApp (todos)",
  LANG_ALL: { pt: {...}, en: {...} },
  OPTIONS: { iconName: "fa-microphone", context: "ALL", color: "GREEN",
             role: "USER", width: "360", height: "220", extranet: "N" },
});
results["placement_IM_TEXTAREA_AUDIO_ALL"] = r.error ? `ERROR: ${r.error}` : "OK";
```

### 2. `supabase/functions/bitrix24-install/index.ts`
Mesmo bloco adicional logo após o registro do áudio LINES (linhas 2060–2093), para que portais novos já fiquem com as duas variantes.

### 3. Deploy + rebind
- Fazer deploy de `bitrix24-rebind-events` e `bitrix24-install`.
- Invocar `bitrix24-rebind-events` para o portal ativo e validar no JSON de retorno os campos `placement_IM_TEXTAREA_AUDIO = OK` e `placement_IM_TEXTAREA_AUDIO_ALL = OK`.

## Observações
- O handler `bitrix24-im-send-audio` não precisa de alteração — o query string `?ctx=all` é ignorado pela função (ela só serve o HTML do iframe).
- Quando o usuário abrir a variante "todos" num chat que não seja Open Channel, o widget ainda carrega; só o envio para WhatsApp pode falhar (igual ao comportamento esperado descrito por você).
- Sem mudanças de UI no app Lovable, sem mudanças de schema.

Pronto para aplicar?
