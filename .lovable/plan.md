# Botão de link real (CTA URL) no WhatsApp

Hoje o robot `emmely_send_whatsapp` com `message_type = link_button` cai num fallback que só envia texto ("Link de Pagamento" + URL). O WhatsApp tem um tipo interativo próprio (`cta_url`) que renderiza um botão azul clicável abaixo do texto — é isso que vamos passar a enviar.

## Limitação importante (a explicar ao utilizador)
- **CTA URL só funciona dentro da janela de 24h** desde a última mensagem do contacto. Fora dessa janela, o WhatsApp obriga a usar um **template aprovado** com botão URL. Para os casos de "link de pagamento" enviados por robot em qualquer momento, o caminho 100% garantido é criar um template HSM aprovado com botão URL dinâmico e usar `message_type = template`. Vamos suportar os dois caminhos.

## Alterações

### 1. `supabase/functions/gupshup-send/index.ts`
- Adicionar novo `message_type: "cta_url"`.
- No `buildMessageObject`, gerar o objeto interativo do Gupshup:
  ```
  { type: "cta_url", cta_url: { display_text: label, url }, body: { text: content } }
  ```
- `validate()`: exige `interactive.cta_url.url` e `interactive.cta_url.display_text`.

### 2. `supabase/functions/message-send/index.ts`
- Aceitar `message_type: "cta_url"` com `resolvedInteractiveData = { url, label }`.
- Ramo Gupshup: montar `gsBody = { message_type: "cta_url", interactive: { type: "cta_url", cta_url: {...}, body: { text: content } } }`.
- Ramo WhatsApp Cloud API oficial: `waPayload = { type: "interactive", interactive: { type: "cta_url", body: { text: content }, action: { name: "cta_url", parameters: { display_text, url } } } }`.
- Ramo WUZAPI: não suporta CTA nativo; fallback para texto `content + \n\n + label + \n + url` (comportamento atual).
- Guardar em `messages.media_type = "cta_url"` e `media_url = url` para render no CRM.

### 3. `supabase/functions/bitrix24-robot-handler/index.ts` — branch `link_button` / `link`
Substituir o fallback de texto por:
```
sendBody.message_type = "cta_url";
sendBody.content = message || "";           // corpo acima do botão
sendBody.resolvedInteractiveData = { url, label: label || "Abrir link" };
```
Manter validação: se `link_button_url` ausente, devolver erro.

### 4. Deploy
Deploy de `gupshup-send`, `message-send` e `bitrix24-robot-handler`.

### 5. Nota ao utilizador na resposta
- Botão CTA vai funcionar em conversas activas (janela 24h).
- Para envios frios de link de pagamento, recomendar criar template HSM com botão URL dinâmico e usar `message_type = template` com `template_params` (o URL vira parâmetro do botão).

## Detalhes técnicos
- Referência Gupshup: `type: "cta_url"` em https://docs.gupshup.io/reference/msg (interactive messages).
- Referência Cloud API: `interactive.type = "cta_url"` com `action.name = "cta_url"`.
- `MessageBubble.tsx` já renderiza link previews; nada a alterar no frontend agora.
- Nenhuma mudança de DB necessária.
