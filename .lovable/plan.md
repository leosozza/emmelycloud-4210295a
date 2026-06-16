## Objetivo
Corrigir o envio de áudio pelo botão/placement do Bitrix24 para que:
- o carregamento não fique girando indefinidamente;
- a interface só mostre sucesso quando o provedor confirmar o envio;
- falhas reais apareçam como erro claro, sem fechar/enganar o operador;
- o histórico local não marque como enviado algo que falhou no WhatsApp.

## Diagnóstico confirmado
- O áudio está chegando ao backend e sendo salvo no storage.
- A conversa está sendo resolvida corretamente pelo `dialogId/chatId`.
- Os registros recentes de áudio foram gravados na tabela `messages` com `delivery_status = failed`, apesar do iframe exibir “Áudio enviado”.
- O problema está no contrato entre `bitrix24-im-send-audio` e `message-send`: a UI considera a etapa como concluída mesmo quando o envio externo fica pendente/falha, e não há timeout/feedback robusto.

## Plano de implementação

1. **Endurecer `bitrix24-im-send-audio`**
   - Adicionar timeout no `fetch` para `message-send`, evitando spinner infinito.
   - Tratar explicitamente respostas `{ success: false }`, `{ error }`, HTTP 4xx/5xx e resposta vazia.
   - Só retornar `{ ok: true }` ao iframe se `message-send` confirmar sucesso real.
   - Em falha, retornar erro detalhado e manter o iframe aberto para nova tentativa.

2. **Corrigir feedback visual do iframe**
   - Remover o “Áudio enviado ✔” prematuro.
   - Mostrar “Enviado para o WhatsApp” apenas depois de confirmação real.
   - Mostrar mensagem de erro quando o backend indicar falha, com botão para tentar novamente.
   - Evitar estado simultâneo de spinner + sucesso.

3. **Alinhar persistência do `message-send`**
   - Garantir que áudio só seja salvo como `sent` quando o provedor retorna sucesso.
   - Se o provedor retorna erro, não gravar como enviado; se já houver lógica de auditoria que grava `failed`, preservar esse comportamento e expor o motivo.
   - Melhorar logs para diferenciar: upload OK, conversão OK, provedor chamado, resposta do provedor, persistência local.

4. **Validar o caso real**
   - Revisar logs das funções após a correção.
   - Testar o endpoint do iframe/áudio com retorno simulado quando possível.
   - Confirmar que em falha o operador vê erro; em sucesso o modal fecha após confirmação; e a tabela `messages` não mostra falso positivo.

## Arquivos previstos
- `supabase/functions/bitrix24-im-send-audio/index.ts`
- `supabase/functions/message-send/index.ts`