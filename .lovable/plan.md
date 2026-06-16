## Diagnóstico

A tela branca acontece porque o `bitrix24-im-send-audio.html` é servido pelo Cloudflare Pages (`emmelycloud.pages.dev`) sem os cabeçalhos que autorizam o Bitrix24 a embutir a página num iframe. Verifiquei a resposta HTTP do ficheiro:

- Não há `X-Frame-Options: ALLOWALL`
- Não há `Content-Security-Policy: frame-ancestors *`

Sem isso, alguns browsers (e o próprio modal do Bitrix24) bloqueiam o render → modal abre vazio/branco e o botão "gravar áudio" nunca aparece. Esta é exatamente a regra registada em memória do projeto:
> "Bitrix24 iframes MUST include `X-Frame-Options: ALLOWALL` and `Content-Security-Policy: frame-ancestors *`."

Não existe ficheiro `public/_headers` no projeto, por isso o Cloudflare Pages serve sem qualquer header de framing.

## Correção

Criar `public/_headers` (formato Cloudflare Pages) liberando o framing para as páginas que o Bitrix24 carrega em iframe — em particular `bitrix24-im-send-audio.html`, mas estendendo a regra a todo o site (a app inteira já é embebida pelo Bitrix24):

```text
/*
  X-Frame-Options: ALLOWALL
  Content-Security-Policy: frame-ancestors *
  Referrer-Policy: strict-origin-when-cross-origin

/bitrix24-im-send-audio.html
  X-Frame-Options: ALLOWALL
  Content-Security-Policy: frame-ancestors *
  Cache-Control: no-store
```

Notas:
- `X-Frame-Options: ALLOWALL` não é padrão, mas browsers ignoram silenciosamente — o que efetivamente autoriza o iframe é o `frame-ancestors *` da CSP.
- O `Cache-Control: no-store` específico do HTML do áudio evita que uma versão antiga em cache continue a aparecer ao usuário depois do deploy.

Após o deploy do frontend (Cloudflare Pages), reabrir o botão de áudio no Bitrix24 — o modal deve renderizar o microfone normalmente.

## Ficheiros alterados

- `public/_headers` (novo)

Nenhuma edge function precisa ser tocada.