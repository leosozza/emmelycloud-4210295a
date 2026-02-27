

## Reconhecimento de Voz — Web Speech API como Fallback Gratuito

### Situação Atual

O botão de áudio (`AudioRecordButton`) usa **exclusivamente** o ElevenLabs Scribe (modelo `scribe_v2_realtime`), que requer API key paga e token server-side. Não existe fallback nativo do browser.

### Proposta

Adicionar suporte à **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`) como alternativa gratuita e sem dependência de API key. O sistema tentará primeiro o ElevenLabs (se configurado) e usará automaticamente a Web Speech API como fallback — ou o utilizador poderá escolher.

### Plano de Implementação

#### 1. Criar hook `useSpeechRecognition`
Novo ficheiro `src/hooks/useSpeechRecognition.ts`:
- Wrapper React sobre a Web Speech API nativa do browser
- Props: `lang`, `continuous`, `interimResults`, callbacks (`onResult`, `onError`, `onEnd`)
- Retorna: `isAvailable`, `isListening`, `transcript`, `partialTranscript`, `start()`, `stop()`, `toggle()`
- Deteta suporte via `window.SpeechRecognition || window.webkitSpeechRecognition`

#### 2. Criar componente `SpeechRecordButton`
Novo ficheiro `src/components/chat/SpeechRecordButton.tsx`:
- Mesma interface visual do `AudioRecordButton` (ícone mic, tooltip com texto parcial)
- Usa o hook `useSpeechRecognition` internamente
- Sem dependência de ElevenLabs — funciona 100% no browser
- Mostra badge "Browser" para distinguir do ElevenLabs

#### 3. Atualizar `AudioRecordButton` com fallback inteligente
- Tenta obter token ElevenLabs; se falhar (sem credenciais), usa automaticamente `SpeechRecognition` nativa
- Prop opcional `preferNative?: boolean` para forçar Web Speech API
- Indicador visual de qual engine está ativa

#### 4. Integrar no ChatIA e Bitrix24
- `ChatIA.tsx`: Já usa `AudioRecordButton` — funciona automaticamente com fallback
- `Bitrix24App.tsx` (`ChatIABitrixView`): Beneficia especialmente porque evita chamada à Edge Function no iframe

### Detalhes Técnicos

- A Web Speech API é suportada em Chrome, Edge, Safari (parcial) — não em Firefox
- `webkitSpeechRecognition` é necessário para compatibilidade
- Idioma padrão: `pt-PT` (com fallback `pt-BR`), configurável via `LocaleContext`
- Sem alterações de base de dados ou Edge Functions necessárias

### Ficheiros a Criar/Alterar
- **Criar**: `src/hooks/useSpeechRecognition.ts`
- **Alterar**: `src/components/chat/AudioRecordButton.tsx` — adicionar fallback nativo
- **Alterar**: `src/pages/Bitrix24App.tsx` — `ChatIABitrixView` usar fallback nativo

