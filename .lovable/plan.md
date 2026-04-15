

## Problema actual

O plano anterior **foi aplicado** no código, mas há 3 problemas remanescentes:

1. **Nome do operador no WhatsApp** — `message-send` grava `sender_name` no DB mas **não prefixa** o conteúdo da mensagem com o nome ao enviar via WhatsApp/Instagram. O cliente recebe "teste plancement" em vez de `*Operador:*\nteste plancement`.

2. **Nome genérico "Operador Bitrix24"** — A chamada `BX24.callMethod('user.current')` é assíncrona e pode não ter terminado quando `doSend` é executado. O fallback `'Operador Bitrix24'` é usado.

3. **AI não usa modo silencioso** — `ai-process-message` chama `bitrix24-send` sem `silent: true`, logo as análises de IA são visíveis ao cliente no Open Channel.

## Plano de correcção

### 1. Prefixar mensagem com nome do remetente no `message-send`

No `message-send`, quando `bodySenderName` é fornecido e o conteúdo é texto simples, prefixar o conteúdo enviado ao WhatsApp/Instagram com `*{sender_name}:*\n{content}`. A mensagem gravada no DB mantém o conteúdo original.

### 2. Garantir carregamento do utilizador antes de permitir envio no CRM tab

No `bitrix24-crm-tab`, mover a chamada `user.current` para o início da inicialização e guardar o resultado antes de habilitar o botão de envio. Aguardar com `await` (ou callback que desbloqueia o UI) para que `operatorName` nunca seja o fallback genérico.

### 3. Passar `silent: true` no `ai-process-message`

No bloco que chama `bitrix24-send` dentro de `ai-process-message`, adicionar `silent: true` ao body JSON para que as respostas de IA fiquem registadas internamente no Bitrix24 sem chegar ao cliente.

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `supabase/functions/message-send/index.ts` | Prefixar conteúdo com `*sender_name:*\n` ao enviar para WhatsApp/Instagram |
| `supabase/functions/bitrix24-crm-tab/index.ts` | Aguardar `user.current` antes de habilitar envio |
| `supabase/functions/ai-process-message/index.ts` | Adicionar `silent: true` ao body do `bitrix24-send` |

### Resultado esperado
- Mensagens do placement chegam ao WhatsApp com `*Leonardo de Souza:*\nteste plancement`
- Nome correcto do operador sempre presente (nunca "Operador Bitrix24")
- Respostas de IA ficam visíveis apenas internamente no chat do Bitrix24

