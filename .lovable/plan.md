Vou corrigir o placement “Emmely AI” do Bitrix24 para que ele encontre a conversa do atendimento pelo telefone do card CRM e mostre todas as conversas/instâncias relacionadas ao mesmo contato.

Plano de implementação:

1. Corrigir a busca por conversa no placement
   - Atualizar `bitrix24-crm-tab` para, ao abrir um Lead/Negócio/Contacto, buscar conversas WhatsApp por todas as variações do telefone:
     - número completo com DDI;
     - últimos 11 dígitos;
     - últimos 9 dígitos;
     - comparação normalizada removendo símbolos e `+`.
   - Priorizar correspondência por vínculo direto no `bot_state`, mas se não encontrar, usar o telefone do card CRM como fallback obrigatório.
   - Remover email/Instagram desta lógica do placement e focar no WhatsApp, como combinado.

2. Mostrar todas as conversas encontradas para o mesmo contato
   - Em vez de devolver só a primeira conversa, o placement vai montar uma lista de conversas candidatas com o mesmo telefone.
   - A lista será ordenada por conversa ativa e mensagem mais recente.
   - No topo da aba “Conversa”, adicionar um seletor simples com:
     - nome do contato;
     - telefone;
     - status;
     - data da última mensagem;
     - canal/instância quando disponível.
   - Ao selecionar outra conversa, o placement recarrega com essa conversa escolhida.

3. Suportar múltiplas instâncias WhatsApp
   - O seletor deve permitir distinguir conversas do mesmo telefone em instâncias diferentes quando houver informação disponível em `bot_state`, `bitrix_chat_id`, `contact_lid` ou metadados relacionados.
   - Ao enviar mensagem pelo placement, preservar o `conversation_id` selecionado para responder na conversa correta.

4. Evitar falso “Nenhuma conversa ativa encontrada”
   - Se o card Bitrix tiver telefone e existir conversa no Atendimento com esse número, o placement deve mostrar a conversa, mesmo que ela ainda não esteja vinculada ao ID do Deal/Lead.
   - Depois de encontrar a conversa, salvar o vínculo no `bot_state` (`bitrix_deal_id`, `bitrix_lead_id` ou `bitrix_entity_id`) para as próximas aberturas ficarem instantâneas.

5. Melhorar a mensagem de vazio
   - Se realmente não houver conversa para o telefone, mostrar uma mensagem mais clara: “Nenhuma conversa WhatsApp encontrada para este telefone”.
   - Exibir o telefone que foi pesquisado para facilitar diagnóstico.
   - Manter a opção de iniciar conversa apenas quando não houver histórico.

Arquivos principais:
- `supabase/functions/bitrix24-crm-tab/index.ts`

Detalhes técnicos:
- Vou refatorar `findConversationByPhone` para retornar múltiplas conversas candidatas, não apenas uma.
- Vou adicionar normalização robusta de telefone dentro da função, evitando depender somente de `ilike`.
- Vou ajustar `renderHtml` para receber `conversationOptions` e renderizar o seletor.
- Vou manter o envio usando a função existente `message-send`, sempre com a conversa selecionada.