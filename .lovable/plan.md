## Plano

O botão aparece, mas o modal abre branco porque o Bitrix24 abre o `HANDLER` do placement por **POST**. O domínio atualmente registrado (`emmelycloud.pages.dev/bitrix24-im-send-audio.html`) responde **405** nesse POST e, no GET, ainda cai no `index.html` em vez do HTML do áudio. Por isso o iframe fica vazio.

## O que vou alterar

1. **Trocar o handler canônico do botão de áudio**
   - Em `bitrix24-install` e `bitrix24-rebind-events`, registrar o botão de áudio apontando para:
     - `https://emmelycloud.lovable.app/bitrix24-im-send-audio.html`
   - Esse domínio já responde ao POST do Bitrix24 com o HTML correto do gravador.

2. **Limpar todos os handlers antigos antes de registrar de novo**
   - Remover do placement as variantes antigas:
     - edge function `/functions/v1/bitrix24-im-send-audio`
     - edge function `?ctx=all`
     - `https://emmelycloud.pages.dev/bitrix24-im-send-audio.html`
     - `https://emmelycloud.lovable.app/bitrix24-im-send-audio.html`
   - Depois registrar apenas uma vez o handler correto, evitando botões duplicados.

3. **Manter o envio do áudio pela função atual**
   - A página HTML continuará usando a função `bitrix24-im-send-audio` apenas para o upload/envio do áudio.
   - Não vou mexer no fluxo de envio/WhatsApp agora, só no carregamento do botão/modal.

4. **Atualizar o diagnóstico interno**
   - Ajustar `.lovable/plan.md` para refletir a causa real: POST 405 no Cloudflare Pages para o handler estático, não apenas falta de headers.

## Validação

- Confirmar via HTTP que o handler escolhido responde ao POST com o HTML do gravador.
- Depois de aprovar, será necessário executar o rebind/reinstalação para o Bitrix24 trocar o handler antigo pelo novo.