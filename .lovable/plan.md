## Diagnóstico

Você tem razão: nenhuma outra aplicação pede um "Partner Token" separado para enviar áudio como nota de voz (PTT). A abordagem atual em `gupshup-send/index.ts` foi excessiva — tentei usar o endpoint `partner.gupshup.io/v3/message` (que requer token de parceiro), quando o endpoint público `api.gupshup.io/wa/api/v1/msg` já suporta PTT corretamente, desde que o áudio seja entregue como **Ogg/Opus** (`audio/ogg; codecs=opus`). O WhatsApp renderiza automaticamente como nota de voz quando o container/codec é esse.

O verdadeiro problema do "chega 2 áudios e não como PTT" vem de duas causas combinadas:
1. O áudio gravado no browser sai como `audio/webm` ou `audio/mp4`. Quando enviado assim, o WhatsApp mostra como anexo de áudio comum (não PTT) e algumas instâncias acabam duplicando porque há reencode + reenvio.
2. O fallback atual estava montando o objeto Gupshup como `{ type: "audio", url }` sem garantir que a URL servida é `.ogg` com mime `audio/ogg; codecs=opus`.

## Plano

1. **Remover totalmente o caminho Partner Token** em `supabase/functions/gupshup-send/index.ts`:
   - Apagar `uploadGupshupMediaByUrl`, `sendGupshupVoiceNote`, constantes `GUPSHUP_PARTNER_URL` e leitura de `GUPSHUP_PARTNER_TOKEN`.
   - Manter apenas o envio pelo endpoint público `/wa/api/v1/msg`.
   - Não pedir novo segredo ao usuário.

2. **Garantir que áudio sai como Ogg/Opus antes de chegar ao Gupshup** (`supabase/functions/message-send/index.ts` e `bitrix24-im-send-audio/index.ts`):
   - Se `force_ptt` estiver setado e o arquivo recebido não for `audio/ogg`, converter para `audio/ogg; codecs=opus` usando o pipeline já existente (ou rejeitar com erro claro se a conversão falhar) antes de fazer upload ao storage.
   - Sempre devolver a URL pública do `.ogg` ao chamar `gupshup-send`, com `media_mime = "audio/ogg; codecs=opus"`.

3. **Endurecer detecção de duplicado** no `bitrix24-worker` (já tem lock de 5s — confirmar que o fluxo PTT não dispara dois `message-send` em paralelo: um pelo iframe e outro pelo handler do evento). Adicionar idempotency key derivada de `dialogId + hash(audio)` no `bitrix24-im-send-audio` para descartar o segundo envio dentro de uma janela curta.

4. **Validação**:
   - Gravar áudio no iframe → verificar logs `[GUPSHUP-SEND]` mostrando `media_mime audio/ogg; codecs=opus` e `status: submitted`.
   - Confirmar no WhatsApp do destinatário que aparece como nota de voz (PTT) e que chega apenas **1** mensagem.

## Arquivos previstos

- `supabase/functions/gupshup-send/index.ts` (remover bloco partner)
- `supabase/functions/message-send/index.ts` (garantir conversão Ogg/Opus antes do envio)
- `supabase/functions/bitrix24-im-send-audio/index.ts` (idempotency key + mime)

## Detalhes técnicos

- Endpoint usado: `POST https://api.gupshup.io/wa/api/v1/msg` com `message={"type":"audio","url":"<public .ogg url>"}`.
- O WhatsApp renderiza como PTT quando o ficheiro servido em `url` responde com `Content-Type: audio/ogg; codecs=opus` (já é o caso quando o storage do Supabase devolve o ficheiro `.ogg` com esse mime).
- Nenhum segredo novo precisa ser adicionado. `GUPSHUP_PARTNER_TOKEN` deixa de ser referenciado.
