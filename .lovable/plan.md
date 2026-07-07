
## Objetivo

Transformar o robot `emmely_send_whatsapp` do Bitrix24 (hoje só texto) num robot completo, capaz de enviar todos os tipos suportados pela API oficial do WhatsApp: texto, imagem, vídeo, áudio, documento, template HSM, botões de resposta (quick reply), botões com link (CTA URL) e lista interativa.

A infraestrutura já existe — `message-send` e `gupshup-send` já suportam todos estes tipos. Falta apenas expor as opções no robot e mapear no handler.

## Alterações

### 1. `supabase/functions/bitrix24-install/index.ts` (definição do robot)

Adicionar novos campos em `PROPERTIES` de `emmely_send_whatsapp` (mantendo `phone` e `message`):

- `message_type` — select: `text` (default), `image`, `video`, `audio`, `document`, `template`, `buttons`, `link_button`, `list`
- `media_url` — string (URL do arquivo para image/video/audio/document)
- `filename` — string (nome do arquivo para document)
- `caption` — text (legenda opcional para mídia; se vazio usa `message`)
- `template_name` — string (nome do template aprovado na Meta)
- `template_language` — string (default `pt_BR`)
- `template_params` — text (parâmetros separados por `|`, ex: `João|1234|10€`)
- `buttons` — text (até 3 botões de resposta rápida, formato `Sim|Não|Talvez` ou `id1:Sim;id2:Não`)
- `link_button_text` — string (texto do botão CTA)
- `link_button_url` — string (URL do botão CTA)
- `list_title` — string (título da lista)
- `list_button_text` — string (texto do botão da lista, ex: "Selecionar")
- `list_items` — text (itens formato `id1:Título 1:Descrição;id2:Título 2:Descrição`)

O mesmo bloco existe duplicado (`repairRobots` + registo inicial) — atualizar ambos.

### 2. `supabase/functions/bitrix24-robot-handler/index.ts` — `handleSendWhatsApp`

Reescrever para interpretar `message_type` e montar o payload correto ao chamar `message-send`:

- **text**: mantém comportamento atual.
- **image / video / audio / document**: envia com `message_type` + `resolvedInteractiveData: { url, filename? }`, `content` = caption ou message.
- **template**: `message_type: "template"`, `resolvedInteractiveData: { name, language, components: [{ type: "body", parameters: params.split("|").map(t => ({ type: "text", text: t })) }] }`.
- **buttons**: `message_type: "interactive_buttons"`, parse dos botões (`;` ou `|`) em `[{ id, title }]`.
- **link_button**: envia como texto simples com URL anexada (WhatsApp Cloud API só permite botões CTA em templates aprovados; fora do template envia link com preview). Documentar essa limitação no `Description` do campo.
- **list**: `message_type: "interactive_list"`, parse dos itens em `[{ id, title, description }]`.

Manter as chamadas internas existentes (`handleSendWhatsApp({ phone, message }, ...)`) funcionando — os novos campos são todos opcionais.

### 3. Deploy e verificação

Deploy de `bitrix24-install` e `bitrix24-robot-handler`. Após deploy, o utilizador precisa reinstalar/reparar o robot na página **Integrações → Bitrix24** para o Bitrix reconhecer os novos campos no diálogo BizProc.

Testes manuais no BizProc:
- Enviar imagem com caption.
- Enviar template com 2 variáveis.
- Enviar mensagem com 3 botões de resposta.
- Enviar lista com 4 itens.

## Notas técnicas

- BizProc do Bitrix24 não suporta arrays nativos em `PROPERTIES`, por isso botões/lista/params usam separadores em string.
- Botões CTA com URL fora de template não são suportados pela API oficial (WhatsApp Cloud + Gupshup). A opção `link_button` cai para texto com URL — o WhatsApp renderiza automaticamente como link clicável com preview.
- Para templates, o nome tem de existir e estar aprovado no BSP (Gupshup) ou Meta Business Manager.
