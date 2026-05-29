## Diagnóstico

O erro não está no `PLACEMENT_OPTIONS`: a documentação confirma que, em `CRM_DEAL_DETAIL_TAB`, o Bitrix24 envia corretamente `PLACEMENT_OPTIONS: {"ID":"..."}` como ID do negócio.

A causa provável está no backend do tab:

- O código passou a preferir o token salvo do app, mas continuou a usar `SERVER_ENDPOINT` vindo do placement quando ele existe.
- Nos logs reais do negócio `36517`, quando o request veio do Bitrix com `SERVER_ENDPOINT`, `crm.deal.get` e `crm.item.get` retornaram `ERROR_METHOD_NOT_FOUND`.
- Quando testei o mesmo deal usando o endpoint salvo da integração (`client_endpoint`), o contacto foi encontrado: `Luis Montes`, contacto `123027`, telefone `351967972905`.
- Depois disso, o problema restante é que não existe conversa local de WhatsApp correspondente a esse telefone/LID, então o tab mostra início de conversa, não uma conversa existente.

## Plano de correção

1. **Separar endpoint por tipo de token**
   - Quando usar o token salvo da integração, usar sempre `integration.client_endpoint`.
   - Só usar `SERVER_ENDPOINT` se realmente cair para o `AUTH_ID` do placement.
   - Isto evita a mistura incorreta `token salvo + endpoint do placement` que gera `ERROR_METHOD_NOT_FOUND`.

2. **Criar um wrapper resiliente para chamadas Bitrix24**
   - Tentar primeiro `integration.client_endpoint + token salvo`.
   - Se a resposta vier com `expired_token`, renovar token e repetir.
   - Se vier `ERROR_METHOD_NOT_FOUND`/erro de endpoint, repetir com endpoint alternativo apenas como fallback controlado.
   - Registar logs seguros com método, endpoint host e erro, sem expor tokens.

3. **Corrigir lookup do negócio/contacto**
   - Garantir que `crm.deal.get` usa o parâmetro conforme documentação (`ID` e fallback `id` quando necessário).
   - Manter `crm.deal.contact.items.get` com `{ id: dealId }`, conforme MCP Bitrix.
   - Para deals, buscar contactos vinculados mesmo quando `crm.deal.get` falhar parcialmente.
   - Persistir no `bot_state` o `bitrix_deal_id` e `bitrix_contact_id` quando o contacto for resolvido.

4. **Melhorar matching local da conversa**
   - Procurar por telefone normalizado com variações: completo, sem `+`, últimos 11, 10, 9 e 8 dígitos.
   - Procurar também em `contact_lid`, `bitrix_chat_id`, `bot_state.bitrix_contact_id` e `bot_state.bitrix_deal_id`.
   - Se houver contacto Bitrix resolvido mas nenhuma conversa local, exibir claramente “contacto encontrado, sem conversa WhatsApp local” em vez de “sem contacto”.

5. **Corrigir criação de conversa a partir do tab**
   - Substituir criação direta via REST anónimo por uma chamada backend segura, para evitar falhas de RLS/permissão.
   - Ao criar conversa pelo tab, já gravar `contact_phone`, `contact_name`, `bot_state.bitrix_deal_id` e `bot_state.bitrix_contact_id`.

6. **Validar com o caso real `36517`**
   - Testar a edge function com payload igual ao Bitrix24 (`CRM_DEAL_DETAIL_TAB`, `PLACEMENT_OPTIONS: {"ID":"36517"}`).
   - Confirmar nos logs:
     - negócio carregado sem `ERROR_METHOD_NOT_FOUND`;
     - contacto `123027` encontrado;
     - telefone `351967972905` resolvido;
     - UI deixa de mostrar “sem contacto”.

## Arquivos a alterar

- `supabase/functions/bitrix24-crm-tab/index.ts`
  - token/endpoint;
  - wrapper de chamadas Bitrix24;
  - resolução de contacto/conversa;
  - UI do estado “sem conversa”.

Possivelmente, se já existir função adequada para criação de conversa/mensagem, reutilizar essa função em vez de criar uma nova.