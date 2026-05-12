## Mostrar telefone abaixo do nome no cabeçalho do chat

**Arquivo:** `src/components/atendimento/ChatPanel.tsx` (linha ~286, dentro do bloco do nome/avatar do contato)

**Mudança:** Inserir uma linha com o `conversation.contact_phone` (ou `contact_email`/`contact_instagram` como fallback conforme o canal) entre o nome e a badge de status.

```tsx
{conversation.contact_phone && (
  <div className="text-xs text-muted-foreground truncate">
    {formatPhone(conversation.contact_phone)}
  </div>
)}
```

- Formatação simples: aplicar máscara `+CC (DD) NNNNN-NNNN` quando for número BR/PT, senão exibe como está.
- Se `contact_phone` estiver vazio, cai para `contact_email` ou `@contact_instagram`.
- Não altera nenhuma lógica/dados, apenas apresentação.