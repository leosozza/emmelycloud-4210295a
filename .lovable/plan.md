## Objetivo

Melhorar a página `/atendimento` resolvendo 5 problemas: (1) painel direito sempre visível ocupando espaço, (2) input de mensagem desproporcional, (3) conversas sem cor que ajude identificação de canal, (4) botão "Criar Lead" aparece mesmo quando já existe vínculo Bitrix24, (5) ação deve ser "Salvar no CRM" (Lead/Negócio/SPA), não apenas "Criar Lead".

---

## Mudanças

### 1. Painel direito (ContactProfile) — recolhível por padrão
- Painel fica **oculto por padrão**. Aparece ao clicar **2x** na conversa (lista) ou **1x** no avatar/nome do contacto no header do chat.
- Botão de fechar (X) no topo do painel.
- Largura preservada (288–320px) quando aberto, sem alterar o chat.
- Estado controlado em `Atendimento.tsx` (`profileOpen` boolean) — passado para `ConversationList` (duplo-clique) e `ChatPanel` (clique no header) via callbacks.
- Mobile mantém comportamento atual (painel só em `lg:`).

### 2. Input de mensagem — proporção corrigida
- Reduzir padding do contêiner (`p-3` → `p-2`) e remover wrapper duplo (`ChatPanel` envolve `ChatInput` em outro `div border-t bg-card p-3`, gerando padding triplo).
- `ChatInput` já tem `chat-input-area p-2.5 md:p-3` — remover o wrapper externo redundante em `ChatPanel.tsx` (linhas 419-440).
- Botões de ação (📎 anexar, 🎤 mic) ficam alinhados com o textarea sem altura excessiva.

### 3. Cores por canal nas conversas
- Adicionar **borda lateral colorida** (4px à esquerda) em cada item da lista, baseada no canal:
  - WhatsApp → verde (`border-l-[#25D366]`)
  - Instagram → roxo/rosa (gradient ou cor sólida)
  - E-mail → azul
  - Webchat → cinza
- Badge do `ChannelIcon` no avatar mantém-se; reforça identificação visual.
- Conversas não lidas mantêm fundo `bg-primary/5`; cor da borda lateral é independente do estado.

### 4. Ação "Salvar no CRM" (substitui "Criar Lead")
- Renomear secção **"Comercial"** → **"CRM Bitrix24"**.
- Botão único **"Salvar no CRM"** abre dropdown/dialog com 3 opções:
  - **Lead** (padrão atual)
  - **Negócio** (Deal — pipeline a escolher)
  - **SPA** (Smart Process — categoria a escolher)
- Reusa Edge Function existente `bitrix24-create-entity` (já suporta os 3 tipos via campo `entity_type`).
- Se conversa já tem vínculo (`bot_state.bitrix_lead_id`, `bitrix_deal_id` ou `bitrix_entity_id`):
  - **Esconde o botão "Salvar no CRM"**.
  - Mostra card com tipo + ID + link "Abrir no Bitrix24" (deep link `https://{portal}/crm/{type}/details/{id}/`).
  - Botão secundário "Criar adicional" para casos onde se quer registar outra entidade (ex.: já tem Lead e quer criar Deal).

### 5. Layout & polish geral
- Lista de conversas: aumentar contraste da linha selecionada (`bg-accent` → `bg-primary/10 border-l-primary`).
- Header do chat: nome do contacto vira clicável (toggle do painel direito) com cursor-pointer.
- Remover wrapper duplicado do input que cria visual "caixa dentro de caixa".

---

## Detalhes técnicos

**Arquivos editados:**
- `src/pages/Atendimento.tsx` — adiciona estado `profileOpen`, passa callbacks para `ConversationList` (`onDoubleClickConversation`) e `ChatPanel` (`onToggleProfile`).
- `src/components/atendimento/ConversationList.tsx` — `onDoubleClick` no item da lista; adiciona borda lateral por canal via `cn()` + map de cores; aceita `onDoubleSelect` prop.
- `src/components/atendimento/ChatPanel.tsx` — header do contacto vira `<button>` que dispara `onToggleProfile`; remove wrapper extra do input.
- `src/components/atendimento/ContactProfile.tsx` — aceita prop `onClose`, renomeia secção, substitui botão único por Dropdown com 3 opções (Lead/Negócio/SPA), oculta CTA quando já vinculado, exibe deep link Bitrix24.
- `src/components/atendimento/ChatInput.tsx` — sem mudanças (proporção corrige no `ChatPanel`).

**Mapeamento de cores por canal** (Tailwind):
```ts
const channelBorderColor: Record<Channel, string> = {
  whatsapp: "border-l-[hsl(142,70%,45%)]",   // verde
  instagram: "border-l-[hsl(330,70%,55%)]",  // rosa
  email:     "border-l-[hsl(210,80%,55%)]",  // azul
  webchat:   "border-l-muted",
};
```

**Lógica de vínculo CRM** (em `ContactProfile.tsx`):
```ts
const linked = bs.bitrix_lead_id || bs.bitrix_deal_id || bs.bitrix_entity_id;
// Se linked → mostra card; senão → mostra dropdown "Salvar no CRM"
```

**Dropdown de opções:** usa `DropdownMenu` shadcn já presente; cada item dispara `bitrix24-create-entity` via `supabase.functions.invoke` com `entity_type: 'lead' | 'deal' | 'spa'`.

**Persistência do painel:** estado `profileOpen` apenas em memória (não persiste entre sessões) — abre fechado sempre.