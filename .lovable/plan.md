## Diagnóstico

O fluxo de texto está OK, mas mídias (áudio/imagem/PDF/vídeo) falham nas duas direções porque:

### Cliente → Bitrix24 (atualmente quebrado)
- `wuzapi-webhook` apenas **detecta** o tipo de mídia e grava `media_type`, mas:
  - `media_url` fica sempre `null` (nunca baixa o arquivo da WUZAPI)
  - Envia para Bitrix24 só o texto `[Imagem]`, `[Áudio]`, `[Documento]` — sem anexo
- `bitrix24-send` envia `message.text` sem `message.files`, então Bitrix nunca recebe o arquivo

### Bitrix24 → Cliente (atualmente quebrado)
- `bitrix24-worker` lê apenas `messageObj.text`. Ignora qualquer estrutura de anexo (`FILES`, `params.FILES`, `disk`)
- Encaminha para `message-send` apenas `{ content }` — sem `message_type`, sem `resolvedInteractiveData`
- Resultado: arquivos enviados pelo operador no canal aberto desaparecem

Curiosamente, `message-send` **já tem** suporte completo a `image`, `audio`, `document`, `video` para WUZAPI — só não é acionado.

---

## Plano

### 1. Recepção de mídia (cliente → Emmely → Bitrix)

**`wuzapi-webhook/index.ts`**
- Para cada tipo de mensagem com mídia (`ImageMessage`, `AudioMessage`, `DocumentMessage`, `VideoMessage`, `StickerMessage`), extrair os campos criptográficos do payload: `Url`, `Mimetype`, `FileSHA256`, `FileLength`, `MediaKey`, `FileEncSHA256`
- Chamar o endpoint da WUZAPI correspondente para descriptografar e baixar o binário:
  - `/chat/downloadimage`
  - `/chat/downloadaudio`
  - `/chat/downloaddocument`
  - `/chat/downloadvideo`
- Fazer upload do binário para o bucket `media` (Supabase Storage), pasta `wuzapi-inbound/<conversation>/<timestamp>-<filename>`
- Obter URL pública e salvar em `messages.media_url` + `media_type`
- Definir `media_filename` quando aplicável (documentos)

### 2. Encaminhamento de mídia para Bitrix24 (cliente → Bitrix)

**`bitrix24-send/index.ts`**
- Aceitar novos parâmetros opcionais: `mediaUrl`, `mediaType`, `mediaFilename`
- No payload de `imconnector.send.messages`, quando houver mídia, anexar `message.files`:
  ```
  message: {
    text: caption || message,
    files: [{ name: mediaFilename || "arquivo", link: mediaUrl, type: mediaType }]
  }
  ```
- Bitrix24 baixa a URL pública e exibe no chat aberto

**`wuzapi-webhook/index.ts`**
- Passar `mediaUrl`, `mediaType`, `mediaFilename` ao chamar `bitrix24-send`

### 3. Recepção de mídia do operador no Bitrix (Bitrix → cliente)

**`bitrix24-worker/index.ts`**
- Ao processar cada mensagem do evento `ONIMCONNECTORMESSAGEADD`, detectar anexos em qualquer um destes locais (a estrutura varia por tenant):
  - `messageObj.files` (array de objetos `{ name, link, type, size }`)
  - `messageObj.params.FILES` ou `messageObj.PARAMS.FILES` (IDs do Disk)
  - `msg.message.attach` (array)
- Para cada arquivo:
  - Se já tiver `link/url` HTTP, usar diretamente
  - Se vier apenas como ID do Disk, chamar `disk.attachedObject.get` (módulo `disk`) ou `im.disk.file.commit` para resolver a URL de download autenticada
  - Detectar tipo (imagem / áudio / documento / vídeo) por `type` ou MIME
- Encaminhar para `message-send` com:
  ```json
  {
    "conversation_id": "...",
    "content": "<caption ou nome do arquivo>",
    "message_type": "image|audio|document|video",
    "resolvedInteractiveData": { "url": "<link>", "filename": "<name>" }
  }
  ```
- Quando houver vários arquivos numa só mensagem, despachar uma chamada por arquivo
- Manter o ACK `imconnector.send.status.delivery` para todos os IDs

### 4. Storage para mídia recebida

- Verificar se o bucket `media` existe; se não, criar como **público** (já existem outros buckets públicos — `proposal-files`, `signatures`)
- Adicionar bucket `media` via SQL migration apenas se necessário

### 5. Detalhes técnicos

- **Limite de tamanho WUZAPI**: arquivos grandes podem timeoutar — registar warning quando `FileLength > 16MB` mas tentar downloadar mesmo assim
- **MIME → message_type**: mapeamento canónico
  - `image/*` → `image`
  - `audio/*` → `audio` (oggs PTT também)
  - `video/*` → `video`
  - todo o resto → `document`
- **Nome de arquivo**: para áudio/imagem sem nome, gerar `<timestamp>.<ext>` baseado no MIME
- **Logs**: aumentar verbosidade em `bitrix24_debug_logs` com novos `event_type`: `media_inbound_downloaded`, `media_outbound_received`, `media_forwarded_to_wuzapi`
- **Falhas**: se download da WUZAPI falhar, manter o registo da mensagem com `media_url=null` mas o texto descritivo (`[Imagem - falha ao baixar]`) para não perder a mensagem

### Arquivos a editar
- `supabase/functions/wuzapi-webhook/index.ts` — download de mídia + upload para Storage + envio com link ao Bitrix
- `supabase/functions/bitrix24-send/index.ts` — incluir `message.files` no payload
- `supabase/functions/bitrix24-worker/index.ts` — detectar anexos do Bitrix + chamar `message-send` com `message_type` + URL
- (Eventual) migração SQL para criar bucket `media` se não existir
