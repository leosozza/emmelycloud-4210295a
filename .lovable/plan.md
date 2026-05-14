## Problema

Quando chega uma mensagem nova, a conversa não sobe para o topo da lista (como acontece no WhatsApp). No banco o `last_message_at` é atualizado corretamente, mas o cache do React Query é mutado in-place sem reordenar.

## Causa

`src/pages/Atendimento.tsx` (linhas 117–124) — handler realtime de `UPDATE` em `conversations`:
```ts
queryClient.setQueryData(["conversations"], (prev) =>
  (prev ?? []).map((c) => c.id === payload.new.id ? { ...c, ...payload.new } : c)
);
```
Substitui o item no mesmo índice. O mesmo problema existe no INSERT (sempre prepende, mesmo que o `last_message_at` seja antigo) e no efeito de "marcar como lido".

## Correção

1. Criar helper local `sortByLastMessage(list)` que ordena desc por `last_message_at` (com `nulls last`).
2. Aplicar o helper em **todos** os `setQueryData(["conversations"], …)`:
   - INSERT realtime
   - UPDATE realtime  ← causa principal
   - Mark-as-read effect
   - Qualquer outro local que mute o array (`onMessageSent`, etc.)
3. Não mexer no fetch inicial — já vem ordenado do servidor.

## Arquivos

- `src/pages/Atendimento.tsx` — adicionar helper e envolver os 3–4 `setQueryData`.

Sem mudanças de schema, sem edge functions, sem RLS. Mudança puramente de frontend.