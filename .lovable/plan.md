## Plano de correção

O áudio `audio-1778699036677.webm` está salvo na mensagem como `content`, e o componente de áudio interpreta qualquer `content` que não seja placeholder como transcrição. Por isso o nome do arquivo aparece no bloco de transcrição.

### 1. Separar legenda/transcrição de nome de arquivo no envio de mídia
- Ajustar `src/hooks/useSendMessage.ts` para, quando `media.type === "audio"`, enviar `content` como `"🎤 Áudio"` em vez do nome do arquivo.
- Manter `file_name` separado para upload/storage e envio ao provedor.

### 2. Blindar a UI contra nomes de arquivo falsos como transcrição
- Ajustar `src/components/atendimento/AudioMessageBubble.tsx` para ignorar `content` que pareça nome de arquivo de áudio (`audio-*.webm`, `.ogg`, `.mp3`, `.m4a`, etc.).
- Se não houver transcrição real, o botão continuará mostrando `Transcrever` e a transcrição só aparecerá depois do STT.

### 3. Evitar texto duplicado abaixo do player
- Ajustar `src/components/atendimento/MessageBubble.tsx` para não renderizar, fora do player, nomes de arquivo quando a mídia for áudio.
- Continuar permitindo texto real/transcrição quando existir.

### 4. Corrigir o registro já afetado
- Atualizar no banco a mensagem atual cujo `content` é `audio-1778699036677.webm` para `🎤 Áudio`, preservando `media_url` e `media_type`.

### 5. Validar
- Conferir no banco que a mensagem afetada deixou de usar o nome do arquivo como conteúdo.
- Verificar que áudios novos passam a aparecer como áudio sem transcrição falsa e ainda permitem transcrever manualmente.