# Plano para fazer as conversas do Gupshup aparecerem no Emmely Cloud

## Objetivo
Garantir que mensagens recebidas via Gupshup criem/atualizem conversas visíveis em `/atendimento` e eliminar os registros órfãos que hoje indicam evento processado sem conversa persistida.

## O que vou implementar

1. **Auditar e corrigir o fluxo do webhook do Gupshup**
   - Revisar o caminho completo de entrada da mensagem até a gravação em `conversations` e `messages`.
   - Adicionar logs objetivos no webhook para identificar criação de conversa, deduplicação, falha de insert e atualização de unread.
   - Corrigir qualquer ponto que permita retornar sucesso sem persistir a conversa/mensagem.

2. **Corrigir o fluxo de teste que hoje gera notificação órfã**
   - Ajustar `gupshup-webhook-test` para validar persistência de ponta a ponta sem deixar `notifications` apontando para `conversation_id` inexistente.
   - Garantir limpeza completa dos registros sintéticos criados pelo teste.

3. **Blindar a exibição no atendimento**
   - Verificar se a listagem em `Atendimento.tsx`/`ConversationList.tsx` depende de algum campo que o fluxo Gupshup não está preenchendo.
   - Ajustar o frontend apenas se houver filtro/estado impedindo a renderização de conversas válidas.

4. **Validar com teste real do backend**
   - Executar chamadas diretas às funções para confirmar:
     - criação da conversa,
     - criação da mensagem,
     - atualização de `last_message_at`/`last_message_preview`,
     - visibilidade na query que abastece a tela.

## Diagnóstico atual
- A tela de atendimento está carregando `conversations` com sucesso.
- Existem notificações para a conversa `89e922df-efac-4506-868a-b56c576a49a2`, mas essa conversa **não existe** na tabela `conversations` e também não há mensagens ligadas a ela.
- Isso indica um problema de integridade no fluxo de entrada/teste, não um bloqueio simples de RLS na tela.
- As políticas de `conversations` e `messages` para utilizadores autenticados estão presentes e, pelo que vi, não explicam sozinhas o desaparecimento.

## Detalhes técnicos
- Arquivos principais a ajustar:
  - `supabase/functions/gupshup-webhook/index.ts`
  - `supabase/functions/gupshup-webhook-test/index.ts`
  - possivelmente `src/pages/Atendimento.tsx` ou `src/components/atendimento/ConversationList.tsx` se houver filtro inconsistente
- Não pretendo alterar autenticação nem expandir escopo para outras integrações.
- Se eu identificar problema estrutural no banco (ex.: trigger/função ausente ou inconsistência de dados), proponho a migração mínima necessária antes do restante.

## Resultado esperado
Depois disso, uma mensagem recebida pelo Gupshup deve aparecer como conversa normal no atendimento do Emmely Cloud, com preview, contador de não lidas e histórico consistente.