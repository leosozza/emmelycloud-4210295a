

# Plano: Chat IA estilo ChatGPT (standalone + iframe Bitrix24)

## Objectivo

Criar uma nova pagina `/chat` com interface de conversacao estilo ChatGPT — historico de conversas na sidebar, markdown rendering nas respostas, selecao de agente, e experiencia focada no chat. A mesma interface sera replicada dentro do iframe do Bitrix24 como nova vista "Chat IA".

## O que existe hoje

- **PlaygroundIA** (`/playground`): chat basico com painel de debug e metricas — focado em testes tecnicos, nao em uso diario
- **PlaygroundView** no Bitrix24: versao simplificada do mesmo
- Ambos usam a Edge Function `ai-playground` que ja suporta knowledge base (RAG) e multiplos agentes

## Diferenca em relacao ao Playground actual

| Aspecto | Playground actual | Novo Chat IA |
|---------|------------------|-------------|
| Objectivo | Testar agentes | Usar agentes no dia-a-dia |
| Historico | Nenhum (perde ao sair) | Persistido na BD, lista na sidebar |
| Layout | Painel debug + chat | Fullscreen chat, sidebar conversas |
| Markdown | Texto puro | Rendering com formatacao |
| Mensagem de boas-vindas | Nao | Sim, usando `welcome_message` do agente |

## Alteracoes

### 1. Base de Dados: tabela `chat_sessions`

Nova tabela para persistir conversas do chat IA:

```sql
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id uuid REFERENCES ai_agents(id),
  title text DEFAULT 'Nova conversa',
  messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions"
  ON public.chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2. Nova pagina: `src/pages/ChatIA.tsx`

Layout estilo ChatGPT:

```
+------------------+-------------------------------+
| Sidebar          | Area do Chat                  |
| [+ Nova conversa]|                               |
|                  |  (welcome ou historico)        |
| - Conversa 1     |                               |
| - Conversa 2     |  [mensagens com markdown]     |
| - Conversa 3     |                               |
|                  |                               |
| [Agente: v]      | [input] [enviar]              |
+------------------+-------------------------------+
```

Funcionalidades:
- **Sidebar esquerda**: lista de sessoes anteriores, botao "Nova conversa", selector de agente
- **Area principal**: mensagens com rendering de markdown (negrito, listas, codigo), welcome message ao iniciar
- **Persistencia**: cada envio guarda as mensagens na `chat_sessions` via upsert
- **Titulo auto**: apos a primeira resposta, gerar titulo curto a partir do conteudo (substring da primeira mensagem do user)
- Usa `ai-playground` como backend (ja suporta RAG/knowledge)

### 3. Rota no App.tsx

Adicionar rota `/chat` dentro do AppLayout.

### 4. Link na navegacao (AppSidebar/AppHeader)

Adicionar item "Chat IA" no menu principal com icone `MessageSquare`.

### 5. Vista no Bitrix24: `ChatIAView` dentro de `Bitrix24App.tsx`

- Adicionar "Chat IA" como nova opcao no menu lateral do iframe (entre "Playground" e "Pagamentos")
- Replicar a mesma interface mas sem depender de `auth.uid()` — usar `member_id` como identificador alternativo ou chamar a API REST directamente
- Persistencia opcional no iframe (pode usar `localStorage` como fallback)

### 6. Rendering de Markdown simples

Implementar um componente `MarkdownMessage` que converte:
- `**negrito**` → `<strong>`
- `` `codigo` `` → `<code>`
- `\n` → `<br>`
- Listas com `-` ou `1.`
- Blocos de codigo com ` ``` `

Sem dependencias extra — parsing regex simples.

## Ficheiros

| Ficheiro | Accao |
|----------|-------|
| Migracao SQL (`chat_sessions`) | Criar |
| `src/pages/ChatIA.tsx` | Criar |
| `src/components/chat/MarkdownMessage.tsx` | Criar |
| `src/components/chat/ChatSidebar.tsx` | Criar |
| `src/App.tsx` | Adicionar rota `/chat` |
| `src/components/AppSidebar.tsx` | Adicionar link "Chat IA" |
| `src/pages/Bitrix24App.tsx` | Adicionar `ChatIAView` + nav item |

## Impacto

- Nao altera o Playground existente (continua disponivel para debug)
- Reutiliza `ai-playground` Edge Function — zero alteracoes no backend
- RLS garante que cada utilizador so ve as suas sessoes
- No iframe Bitrix24, funciona sem autenticacao Supabase (usa fetch directo)

