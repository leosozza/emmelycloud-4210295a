

# Plano: Botao de Gravacao de Audio com Transcricao Automatica (ElevenLabs Scribe)

## Objectivo

Adicionar um botao de microfone no input do Chat IA (e no iframe Bitrix24) que grava audio do utilizador, transcreve automaticamente via ElevenLabs Scribe (realtime), e insere o texto transcrito no campo de mensagem para enviar ao agente IA.

## Pre-requisitos

O projecto ja tem o pacote `@elevenlabs/react` instalado e uma conexao ElevenLabs disponivel no workspace — mas **nao esta vinculada** ao projecto. Sera necessario vincular primeiro para que a `ELEVENLABS_API_KEY` fique disponivel nas Edge Functions.

## Alteracoes

### 1. Vincular conector ElevenLabs ao projecto

Usar o conector ElevenLabs existente (connection_id: `std_01keaadpqqeh1stxyksn6z99zh`) para disponibilizar a `ELEVENLABS_API_KEY` como variavel de ambiente.

### 2. Nova Edge Function: `elevenlabs-scribe-token`

Gera tokens single-use para transcricao realtime (expira em 15 min). Chama `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe` com a `ELEVENLABS_API_KEY`.

### 3. Novo componente: `src/components/chat/AudioRecordButton.tsx`

Botao de microfone que usa o hook `useScribe` do `@elevenlabs/react`:

- Ao clicar, obtem token via `elevenlabs-scribe-token` e inicia gravacao
- Mostra indicador visual de gravacao (icone a pulsar, texto parcial)
- Ao parar (clique ou VAD), concatena os `committedTranscripts` e insere no campo de input
- Callback `onTranscript(text: string)` para o componente pai receber o texto

```text
[Textarea: mensagem...] [🎤] [➤]
                          ^
                    AudioRecordButton
```

### 4. Integrar no `ChatIA.tsx`

- Importar `AudioRecordButton`
- Adicionar entre o Textarea e o botao Send
- Ao receber transcript, concatenar ao input existente (`setInput(prev => prev + transcript)`)

### 5. Integrar no `Bitrix24App.tsx` (ChatIABitrixView)

- Mesmo botao `AudioRecordButton` na vista de Chat IA do iframe
- Funciona identicamente (chama a Edge Function directamente com fetch)

## Ficheiros

| Ficheiro | Accao |
|----------|-------|
| Conector ElevenLabs | Vincular ao projecto |
| `supabase/functions/elevenlabs-scribe-token/index.ts` | Criar |
| `src/components/chat/AudioRecordButton.tsx` | Criar |
| `src/pages/ChatIA.tsx` | Editar (adicionar botao) |
| `src/pages/Bitrix24App.tsx` | Editar (adicionar botao na ChatIABitrixView) |

## Detalhes Tecnicos

- **Modelo**: `scribe_v2_realtime` (transcricao streaming com latencia ultra-baixa)
- **Commit strategy**: `vad` (Voice Activity Detection — segmenta automaticamente por silencio)
- **Microphone config**: `echoCancellation: true`, `noiseSuppression: true`
- **Idioma**: auto-detect (sem `language_code` fixo — suporta PT, EN, ES, etc.)
- **Seguranca**: API key nunca exposta no frontend; token single-use gerado server-side

## Impacto

- Zero alteracao nos agentes ou no `ai-playground` — o audio e transcrito para texto antes de enviar
- Retrocompativel — o botao e opcional, o input de texto continua a funcionar normalmente
- Funciona em qualquer browser moderno com suporte a `getUserMedia`

