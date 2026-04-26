## Objetivo

Adicionar dois botões dentro da caixa de mensagem (textarea) do bate-papo do Contact Center / Open Channels do Bitrix24:

1. **Enviar Áudio** (gravação de áudio para WhatsApp)
2. **Enviar Arquivo** (PDF / imagem / documento)

Quando o operador clicar, abre um iframe da nossa aplicação que captura o ficheiro / áudio e o envia para o WhatsApp via WUZAPI usando o fluxo já existente (`message-send` + bucket `media`).

## Como funciona no Bitrix24 (validado via MCP)

- O Bitrix24 **não** tem placements separados `IM_AUDIO` / `IM_FILE`. O placement oficial para botões dentro do textarea do messenger é **`IM_TEXTAREA`** (confirmado em `placement.bind` e no artigo *General Information on All Embedding Points*).
- Cada chamada `placement.bind` com `PLACEMENT: "IM_TEXTAREA"` cria **um botão adicional** ao lado do textarea, com `iconName` (Font Awesome 6) e `TITLE` próprios.
- Hoje o projeto já regista 1 botão IM_TEXTAREA ("Devolver ao Bot"). Vamos adicionar mais 2 (áudio e arquivo) com handlers iframe distintos.
- O contexto deve ser `LINES` (Open Channels) para aparecer apenas nos chats vindos do WhatsApp/Contact Center.

## Mudanças

### 1. Duas novas Edge Functions (handlers iframe)

- `supabase/functions/bitrix24-im-send-audio/index.ts`
  - Serve uma página HTML pequena dentro do iframe com:
    - Botão Gravar / Parar (MediaRecorder API → `audio/ogg; codecs=opus`)
    - Pré-visualização e botão "Enviar"
  - No envio: lê do `placementOptions` (BX24.placement.info) o `DIALOG_ID` / chat id, faz upload do blob para o bucket `media` e chama `message-send` com `message_type=audio` e o `mediaUrl` resultante.
  - Headers: `X-Frame-Options: ALLOWALL`, CORS aberto.

- `supabase/functions/bitrix24-im-send-file/index.ts`
  - Mesma estrutura, mas com `<input type="file" accept="image/*,application/pdf,video/mp4,...">`.
  - Detecta MIME e classifica como `image` / `document` / `video` antes de chamar `message-send`.

Ambas as funções obtêm o `chat_id` / `dialog_id` via `BX24.placement.info()` (passado pelo Bitrix ao iframe) e mapeiam para a `conversation` correspondente em `whatsapp_messages` / `conversations` usando o `chat_id` Open Channel já gravado pelo `bitrix24-send` (campo `external_chat_id` / equivalente — verificar nome exato durante implementação).

### 2. Registar os 2 placements adicionais

Editar **`supabase/functions/bitrix24-install/index.ts`** (logo após o bloco existente do "Devolver ao Bot", linhas ~1884–1928) e **`supabase/functions/bitrix24-rebind-events/index.ts`** (após linha ~144) para fazer mais 2 chamadas `placement.bind`:

```ts
// Botão de áudio
await callBitrix(endpoint, accessToken, "placement.bind", {
  PLACEMENT: "IM_TEXTAREA",
  HANDLER: `${SUPABASE_URL}/functions/v1/bitrix24-im-send-audio`,
  TITLE: "Enviar Áudio (WhatsApp)",
  OPTIONS: {
    iconName: "fa-microphone",
    context: "LINES",
    color: "GREEN",
    width: 360, height: 200,
  },
});

// Botão de arquivo
await callBitrix(endpoint, accessToken, "placement.bind", {
  PLACEMENT: "IM_TEXTAREA",
  HANDLER: `${SUPABASE_URL}/functions/v1/bitrix24-im-send-file`,
  TITLE: "Enviar Arquivo (WhatsApp)",
  OPTIONS: {
    iconName: "fa-paperclip",
    context: "LINES",
    color: "AZURE",
    width: 360, height: 200,
  },
});
```

Ambos serão registrados na **instalação** e na **re-vinculação** (`bitrix24-rebind-events`) para portais já instalados.

### 3. Reuso do pipeline existente

- Upload → bucket `media` (já existe).
- Envio para WhatsApp → `message-send` (já trata `message_type` = `audio` / `image` / `document` / `video`).
- Echo no chat do Bitrix → `bitrix24-send` é invocado normalmente pelo fluxo de outbound (já passa `mediaUrl` + `message.files`), garantindo que o anexo aparece na timeline do operador.

### 4. config.toml

Adicionar blocos para as 2 novas funções com `verify_jwt = false` (são iframes públicos servidos ao Bitrix) em `supabase/config.toml`.

## Pontos a confirmar durante a implementação

- Nome do campo que liga o `DIALOG_ID` / `CHAT_ID` da Open Channel à nossa `conversation` (provavelmente `bitrix_chat_id` em `whatsapp_conversations`). Caso não exista, será preciso uma migração para guardá-lo no `bitrix24-send` (já recebemos esse id na resposta do `imconnector.send.messages`).
- Após o envio do operador via iframe, **não** disparar `OnImConnectorMessageAdd` em loop — o áudio/arquivo será enviado apenas para o WhatsApp e replicado no chat via `imconnector.send.messages` (mesmo path do `bitrix24-send`), mantendo idempotência por `external_id`.

## Após o deploy

Pedir ao utilizador para abrir o portal Bitrix24 e clicar no botão **"Re-registar eventos"** (ou reinstalar o app) para que os 2 novos botões `IM_TEXTAREA` apareçam no textarea dos chats de Open Channels.
