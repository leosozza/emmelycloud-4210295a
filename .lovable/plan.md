<final-text>
## Diagnóstico
- O screenshot confirma que o placement está a carregar; o problema é só na associação da conversa.
- Os logs do `bitrix24-crm-tab` mostram `entityId: 23691` e `entityTypeId: 2`, por isso o Deal está a chegar corretamente ao backend.
- Em `supabase/functions/bitrix24-crm-tab/index.ts`, o lookup atual depende de:
  1. telefone/email do Deal
  2. `CONTACT_ID` do Deal
  3. `bot_state`
  4. nome do registo
- No Deal mostrado, o próprio Bitrix exibe “sem contacto”, então o placement não recebe dados suficientes para casar a conversa. Como o código não faz lookup direto pelo vínculo local `lead/deal -> conversation`, cai no estado vazio.

## Plano de correção
1. **Adicionar lookup local determinístico no placement**
   - Em `bitrix24-crm-tab`, antes do fallback por nome, procurar um registo local ligado ao Deal:
     - `leads.bitrix24_id = entityId`
     - se existir, usar `lead.conversation_id`
     - se `conversation_id` estiver vazio, usar `lead.client_id` para procurar a conversa aberta mais recente desse cliente
   - Isto deixa de depender do `CONTACT_ID` do Bitrix para encontrar a conversa.

2. **Melhorar lookup CRM quando o Deal não tem contacto**
   - Manter phone/email/contact lookup atual como apoio.
   - Para Deals, tentar também `COMPANY_ID` quando existir, para aproveitar telefone/email da empresa antes de desistir.

3. **Vincular conversas iniciadas a partir do placement**
   - Alterar o botão “Iniciar conversa” do placement para enviar `member_id`, `entity_id` e `entity_type_id`.
   - Atualizar `message-send` para guardar esse contexto na conversa criada/reativada (ex.: `bot_state.bitrix_entity_id = "2:23691"` e, se houver lead local, atualizar `lead.conversation_id`).
   - Assim, depois do primeiro envio, a conversa passa a reaparecer sempre no placement.

4. **Adicionar logs úteis**
   - Registar qual ramo encontrou a conversa (`lead.conversation_id`, `client_id`, `phone`, `email`, `bot_state`, `name`) para validar rapidamente futuros casos.

## Ficheiros a editar
- `supabase/functions/bitrix24-crm-tab/index.ts` — lookup local por lead/cliente e fallback por empresa
- `supabase/functions/message-send/index.ts` — aceitar contexto do placement e persistir o vínculo da conversa ao Deal

## Validação
- Abrir novamente o Deal `23691` e confirmar que a conversa existente aparece em vez de “Nenhuma conversa ativa encontrada”.
- Enviar mensagem pela aba do placement e confirmar que chega ao WhatsApp.
- Iniciar uma conversa nova a partir do placement, recarregar a aba e confirmar que continua associada ao mesmo Deal.
- Testar também um Lead e um Contact para garantir que os placements anteriores não regrediram.

## Detalhes técnicos
- Não parece ser problema de registo do placement nem de inferência do tipo da entidade; isso já está correto.
- O problema atual é a falta de um vínculo local confiável entre a entidade CRM e a conversa.
- Não prevejo migração de base de dados para esta correção; a ligação pode ser feita com campos já existentes (`leads.bitrix24_id`, `leads.conversation_id`, `leads.client_id`, `conversations.bot_state`).
</final-text>