# Corrigir "[Mensagem não suportada]" no /atendimento

## Diagnóstico

Investigando o histórico da conversa `555599988750` no banco:

```
inbound  audio   has_url=t  "🎤 Silêncio, por favor."        ← funciona
inbound  ∅       has_url=f  "[Mensagem não suportada]"      ← falha
inbound  ∅       has_url=f  "[Mensagem não suportada]"      ← falha (várias)
```

A string vem de `supabase/functions/wuzapi-webhook/index.ts:316`, no `else` final do parser de tipos de mensagem. O parser hoje só reconhece o nó **na raiz** de `message`:

`Conversation`, `ExtendedTextMessage`, `ImageMessage`, `DocumentMessage`, `AudioMessage`, `VideoMessage`, `StickerMessage`, `ContactMessage`, `LocationMessage`.

O WhatsApp/whatsmeow (base do WUZAPI) **encapsula** mensagens em wrappers que carregam o conteúdo real dentro de `.Message`:

- `EphemeralMessage` (mensagens temporárias) → muito comum em conversas novas no WhatsApp Brasil, que tem "mensagens temporárias" ligadas por padrão em vários celulares.
- `ViewOnceMessage`, `ViewOnceMessageV2`, `ViewOnceMessageV2Extension` (visualização única).
- `EditedMessage` / `ProtocolMessage.editedMessage` (edição de mensagem).
- `DeviceSentMessage` (mensagem enviada por outro dispositivo do mesmo usuário).
- `PttMessage` em alguns forks (áudio de voz curto), distinto de `AudioMessage`.

Como o cliente desta conversa está enviando áudios (vide as respostas automáticas "Não conseguimos ouvir seu áudio"), o caso mais provável é **EphemeralMessage envolvendo um AudioMessage** que o parser não desembrulha.

## Correção

Editar `supabase/functions/wuzapi-webhook/index.ts` no bloco de extração de tipo (linhas ~269–317) para:

1. **Desembrulhar wrappers antes de classificar.** Antes do `if/else` atual, em loop (até 3 níveis para segurança), trocar `message` pelo conteúdo interno quando vier:
   - `EphemeralMessage.Message` / `ephemeralMessage.message`
   - `ViewOnceMessage.Message` / `viewOnceMessage.message`
   - `ViewOnceMessageV2.Message` / `viewOnceMessageV2.message`
   - `ViewOnceMessageV2Extension.Message` / `viewOnceMessageV2Extension.message`
   - `DeviceSentMessage.Message` / `deviceSentMessage.message`
   - `EditedMessage.Message` / `editedMessage.message`
   - `ProtocolMessage.EditedMessage.Message` (mensagem editada via protocolo)

2. **Adicionar `PttMessage` / `pttMessage`** como áudio (mesmo tratamento de `AudioMessage`).

3. **Adicionar `ReactionMessage` / `reactionMessage`** com `content = "[Reação] {emoji}"` para não ficar como "não suportada".

4. **Fallback observável.** No `else` final, em vez de só gravar `[Mensagem não suportada]`, logar `Object.keys(message)` para que payloads desconhecidos futuros apareçam em `edge_function_logs` e possam ser adicionados rapidamente.

## Detalhes técnicos

```text
Antes: message = { EphemeralMessage: { Message: { AudioMessage: {...} } } }
                                                  ↑ parser nunca chega aqui

Depois: loop while (wrapper detectado) { message = inner } → AudioMessage classificado
```

Sem mudanças em frontend, RLS, schema ou outras edge functions. A correção é localizada no `wuzapi-webhook` e cobre todos os números, não só `555599988750`.

## Validação

- Após o deploy, mandar uma mensagem temporária / visualização única / áudio PTT no WhatsApp para o número conectado.
- Conferir em `supabase/functions/wuzapi-webhook` logs: deve aparecer `[WUZAPI-WEBHOOK] Media node detected (audio) ...` e a mensagem chegar em `/atendimento` com bolha de áudio em vez de "[Mensagem não suportada]".
